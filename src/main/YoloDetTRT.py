import cv2
import numpy as np
import tensorrt as trt
import pycuda.autoinit
import random
import ctypes
import pycuda.driver as cuda
import time


EXPLICIT_BATCH = 1 << (int)(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)


class YoloTRT():
    """
    Initialize a YoloTRT object for TensorRT Engine Model.

    :param config: Dictionary that contains the 'model' configuration
    :param library: Path to the TensorRT library
    :param yolor_ver: Version of YOLO being used
    """
    def __init__(self, config : dict, library : str=None, yolo_ver : str="v5"):
        #Set config attributes appropriately
        engine       = config['path']
        classes_file = config['classes']
        conf         = config['confidence']

        self.CONF_THRESH = conf 
        self.IOU_THRESHOLD = 0.4
        self.yolo_version = yolo_ver

        #Categories will be obtained from human-readable label text files
        classes = []
        with open(classes_file, 'r') as file:
            for line in file:
                _, class_name = line.split(':')
                classes.append(class_name.strip())

        self.categories = classes

        self.LEN_ONE_RESULT = 5 + len(self.categories)
        self.LEN_ALL_RESULT = 25200 * self.LEN_ONE_RESULT
        
        TRT_LOGGER = trt.Logger(trt.Logger.INFO)

        if library:
            ctypes.CDLL(library)

        with open(engine, 'rb') as f:
            serialized_engine = f.read()

        runtime = trt.Runtime(TRT_LOGGER)
        self.engine = runtime.deserialize_cuda_engine(serialized_engine)
        self.context = self.engine.create_execution_context()

        #Explicit-batch engine built with batch size baked into the input shape (see EXPLICIT_BATCH above)
        self.batch_size = 1

        #Per-instance buffers (TensorRT 10 named-tensor API). These used to be module-level
        #globals, which meant every YoloTRT instance shared (and clobbered) the same buffers -
        #moved onto self so multiple instances/engines can coexist safely.
        self.tensor_names = []
        self.host_inputs   = []
        self.cuda_inputs   = []
        self.host_outputs  = []
        self.cuda_outputs  = []

        for i in range(self.engine.num_io_tensors):
            name = self.engine.get_tensor_name(i)
            self.tensor_names.append(name)

            shape = self.engine.get_tensor_shape(name)
            size = trt.volume(shape)
            dtype = trt.nptype(self.engine.get_tensor_dtype(name))
            host_mem = cuda.pagelocked_empty(size, dtype)
            cuda_mem = cuda.mem_alloc(host_mem.nbytes)

            #Bind the device address now so it doesn't need to be re-set before every Inference() call
            self.context.set_tensor_address(name, int(cuda_mem))

            if self.engine.get_tensor_mode(name) == trt.TensorIOMode.INPUT:
                self.input_w = shape[-1]
                self.input_h = shape[-2]
                self.host_inputs.append(host_mem)
                self.cuda_inputs.append(cuda_mem)
            else:
                self.host_outputs.append(host_mem)
                self.cuda_outputs.append(cuda_mem)

    def PreProcessImg(self, img):
        image_raw = img
        h, w, c = image_raw.shape
        image = cv2.cvtColor(image_raw, cv2.COLOR_BGR2RGB)
        r_w = self.input_w / w
        r_h = self.input_h / h
        if r_h > r_w:
            tw = self.input_w
            th = int(r_w * h)
            tx1 = tx2 = 0
            ty1 = int((self.input_h - th) / 2)
            ty2 = self.input_h - th - ty1
        else:
            tw = int(r_h * w)
            th = self.input_h
            tx1 = int((self.input_w - tw) / 2)
            tx2 = self.input_w - tw - tx1
            ty1 = ty2 = 0
        image = cv2.resize(image, (tw, th))
        image = cv2.copyMakeBorder(image, ty1, ty2, tx1, tx2, cv2.BORDER_CONSTANT, None, (128, 128, 128))
        image = image.astype(np.float32)
        image /= 255.0
        image = np.transpose(image, [2, 0, 1])
        image = np.expand_dims(image, axis=0)
        image = np.ascontiguousarray(image)
        return image, image_raw, h, w

    def Inference(self, img):
        input_image, image_raw, origin_h, origin_w = self.PreProcessImg(img)
        np.copyto(self.host_inputs[0], input_image.ravel())
        stream = cuda.Stream()
        cuda.memcpy_htod_async(self.cuda_inputs[0], self.host_inputs[0], stream)
        t1 = time.time()
        self.context.execute_async_v3(stream_handle=stream.handle)
        cuda.memcpy_dtoh_async(self.host_outputs[0], self.cuda_outputs[0], stream)
        stream.synchronize()
        t2 = time.time()
        output = self.host_outputs[0]
                
        for i in range(self.batch_size):
            result_boxes, result_scores, result_classid = self.PostProcess(output, origin_h, origin_w)
            
        det_res = []
        for j in range(len(result_boxes)):
            box = result_boxes[j]
            det = dict()
            det["class"] = self.categories[int(result_classid[j])]
            det["conf"] = result_scores[j]
            det["box"] = box 
            det_res.append(det)
            self.PlotBbox(box, img, label="{}:{:.2f}".format(self.categories[int(result_classid[j])], result_scores[j]),)
        return det_res, t2-t1

    def PostProcess(self, output, origin_h, origin_w):
        # Raw TRT7 output: flat array of 25200 * (5 + num_classes)
        # Each detection: [x, y, w, h, objectness, class0_score, class1_score, ...]
        num_classes = len(self.categories)
        pred = np.reshape(output, (-1, self.LEN_ONE_RESULT))

        # Filter by objectness * class confidence
        # Get objectness scores
        obj_conf = pred[:, 4]

        # Multiply objectness by class scores
        class_scores = pred[:, 5:] * obj_conf[:, np.newaxis]

        # Get best class and score for each detection
        class_ids = np.argmax(class_scores, axis=1)
        scores = np.max(class_scores, axis=1)

        # Filter by confidence threshold
        mask = scores >= self.CONF_THRESH
        filtered = pred[mask]
        filtered_scores = scores[mask]
        filtered_class_ids = class_ids[mask]

        if len(filtered) == 0:
            return np.array([]), np.array([]), np.array([])

        # Build prediction array: [x, y, w, h, score, class_id]
        result = np.zeros((len(filtered), 6))
        result[:, :4] = filtered[:, :4]  # x, y, w, h
        result[:, 4] = filtered_scores
        result[:, 5] = filtered_class_ids

        # Run NMS
        boxes = self.NonMaxSuppression(result, origin_h, origin_w, conf_thres=self.CONF_THRESH, nms_thres=self.IOU_THRESHOLD)
        result_boxes = boxes[:, :4] if len(boxes) else np.array([])
        result_scores = boxes[:, 4] if len(boxes) else np.array([])
        result_classid = boxes[:, 5] if len(boxes) else np.array([])
        return result_boxes, result_scores, result_classid
    
    def NonMaxSuppression(self, prediction, origin_h, origin_w, conf_thres=0.5, nms_thres=0.4):
        boxes = prediction[prediction[:, 4] >= conf_thres]
        boxes[:, :4] = self.xywh2xyxy(origin_h, origin_w, boxes[:, :4])
        boxes[:, 0] = np.clip(boxes[:, 0], 0, origin_w -1)
        boxes[:, 2] = np.clip(boxes[:, 2], 0, origin_w -1)
        boxes[:, 1] = np.clip(boxes[:, 1], 0, origin_h -1)
        boxes[:, 3] = np.clip(boxes[:, 3], 0, origin_h -1)
        confs = boxes[:, 4]
        boxes = boxes[np.argsort(-confs)]
        keep_boxes = []
        while boxes.shape[0]:
            large_overlap = self.bbox_iou(np.expand_dims(boxes[0, :4], 0), boxes[:, :4]) > nms_thres
            label_match = boxes[0, -1] == boxes[:, -1]
            # Indices of boxes with lower confidence scores, large IOUs and matching labels
            invalid = large_overlap & label_match
            keep_boxes += [boxes[0]]
            boxes = boxes[~invalid]
        boxes = np.stack(keep_boxes, 0) if len(keep_boxes) else np.array([])
        return boxes
    
    def xywh2xyxy(self, origin_h, origin_w, x):
        y = np.zeros_like(x)
        r_w = self.input_w / origin_w
        r_h = self.input_h / origin_h
        if r_h > r_w:
            y[:, 0] = x[:, 0] - x[:, 2] / 2
            y[:, 2] = x[:, 0] + x[:, 2] / 2
            y[:, 1] = x[:, 1] - x[:, 3] / 2 - (self.input_h - r_w * origin_h) / 2
            y[:, 3] = x[:, 1] + x[:, 3] / 2 - (self.input_h - r_w * origin_h) / 2
            y /= r_w
        else:
            y[:, 0] = x[:, 0] - x[:, 2] / 2 - (self.input_w - r_h * origin_w) / 2
            y[:, 2] = x[:, 0] + x[:, 2] / 2 - (self.input_w - r_h * origin_w) / 2
            y[:, 1] = x[:, 1] - x[:, 3] / 2
            y[:, 3] = x[:, 1] + x[:, 3] / 2
            y /= r_h
        return y
    
    def bbox_iou(self, box1, box2, x1y1x2y2=True):
        if not x1y1x2y2:
            # Transform from center and width to exact coordinates
            b1_x1, b1_x2 = box1[:, 0] - box1[:, 2] / 2, box1[:, 0] + box1[:, 2] / 2
            b1_y1, b1_y2 = box1[:, 1] - box1[:, 3] / 2, box1[:, 1] + box1[:, 3] / 2
            b2_x1, b2_x2 = box2[:, 0] - box2[:, 2] / 2, box2[:, 0] + box2[:, 2] / 2
            b2_y1, b2_y2 = box2[:, 1] - box2[:, 3] / 2, box2[:, 1] + box2[:, 3] / 2
        else:
            # Get the coordinates of bounding boxes
            b1_x1, b1_y1, b1_x2, b1_y2 = box1[:, 0], box1[:, 1], box1[:, 2], box1[:, 3]
            b2_x1, b2_y1, b2_x2, b2_y2 = box2[:, 0], box2[:, 1], box2[:, 2], box2[:, 3]

        inter_rect_x1 = np.maximum(b1_x1, b2_x1)
        inter_rect_y1 = np.maximum(b1_y1, b2_y1)
        inter_rect_x2 = np.minimum(b1_x2, b2_x2)
        inter_rect_y2 = np.minimum(b1_y2, b2_y2)
        inter_area = np.clip(inter_rect_x2 - inter_rect_x1 + 1, 0, None) * \
                     np.clip(inter_rect_y2 - inter_rect_y1 + 1, 0, None)
        b1_area = (b1_x2 - b1_x1 + 1) * (b1_y2 - b1_y1 + 1)
        b2_area = (b2_x2 - b2_x1 + 1) * (b2_y2 - b2_y1 + 1)

        iou = inter_area / (b1_area + b2_area - inter_area + 1e-16)

        return iou
    
    def PlotBbox(self, x, img, color=None, label=None, line_thickness=None):
        tl = (line_thickness or round(0.002 * (img.shape[0] + img.shape[1]) / 2) + 1)  # line/font thickness
        color = color or [random.randint(0, 255) for _ in range(3)]
        c1, c2 = (int(x[0]), int(x[1])), (int(x[2]), int(x[3]))
        cv2.rectangle(img, c1, c2, color, thickness=tl, lineType=cv2.LINE_AA)
        if label:
            tf = max(tl - 1, 1)  # font thickness
            t_size = cv2.getTextSize(label, 0, fontScale=tl / 3, thickness=tf)[0]
            c2 = c1[0] + t_size[0], c1[1] - t_size[1] - 3
            cv2.rectangle(img, c1, c2, color, -1, cv2.LINE_AA)  # filled
            cv2.putText(img, label, (c1[0], c1[1] - 2), 0, tl / 3, [225, 255, 255], thickness=tf, lineType=cv2.LINE_AA,)