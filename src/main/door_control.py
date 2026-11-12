import io_control as io
import time
import threading

#This class is used to set and control the state of the door of the gate

# ---------------------------------------------------------------------------
# Stepper motor settings (YM2754, 5-wire unipolar, 7.5 degrees per step)
# ---------------------------------------------------------------------------
# Two-phases-on full-step sequence, in the pin order [IN1, IN2, IN3, IN4]
STEP_SEQUENCE = [
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 1],
    [1, 0, 0, 1],
]

# Direction is the way we move through STEP_SEQUENCE.
# +1 (forward) turned the shaft anticlockwise seen from the shaft end; -1 turned it clockwise.
# Swap these two values if the door moves the wrong way once it is mounted.
OPEN_DIRECTION = 1
CLOSE_DIRECTION = -1

# Seconds per step. 0.25 s (4 steps per second) is the speed verified on the bench.
# The datasheet allows far faster, but higher speeds are untested at the ~7 V the AA pack gives.
STEP_DELAY = 0.25

# Safety cap: a single open or close stops after this many steps even if no Hall sensor triggers.
# 48 steps is one full revolution, so 240 is five revolutions. Set this to the real travel of the door.
MAX_STEPS = 240
motor_mode = io.get_mode()


class stepperControl:
    
    """
    A class to manage and control the state of the gate door.

    The door is moved by a stepper motor driven through the L298N board. open_door() and close_door()
    start a background thread that steps the motor until the matching Hall Effect sensor triggers,
    stop_door() is called, or MAX_STEPS is reached. The thread then switches every coil off.
    The public methods are the same as the earlier DC-motor version.
    """
    def __init__(self):
        #Keep track of door opening and closing states
        self.is_door_opening = False
        self.is_door_closing = False

        #Protects the Hall Effect sensor reads
        self.lock = threading.Lock()

        #Protects starting and stopping the stepping thread
        self._cmd_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread = None

        #Position in STEP_SEQUENCE, kept so a reversal carries on from the last step
        self._step_index = 0

        self.init_door()


    #Door initial state
    def init_door(self):
        """
        Initialize the door to its default state.

        Switches all motor coils off (IN1..IN4 LOW) and resets the door opening and closing status.
        """
        io.set_motor(io.MOTOR_OFF)
        self.is_door_opening = False
        self.is_door_closing = False

    #The stepping loop, run on its own thread
    def _run(self, direction, stop_event):
        """
        Steps the motor in the given direction until the matching Hall Effect sensor triggers,
        stop_event is set, or MAX_STEPS is reached. Always switches all coils off on exit.
        """
        steps = 0
        try:
            while not stop_event.is_set() and steps < MAX_STEPS:
                if direction == OPEN_DIRECTION and self.is_door_fully_open():
                    break
                if direction == CLOSE_DIRECTION and self.is_door_fully_closed():
                    break

                self._step_index = (self._step_index + direction) % len(STEP_SEQUENCE)
                io.set_motor(STEP_SEQUENCE[self._step_index])
                steps += 1

                #Wait one step period, but wake straight away if asked to stop
                stop_event.wait(STEP_DELAY)

            if steps >= MAX_STEPS:
                print("Door stopped: reached the maximum step count without a Hall sensor trigger.")
        except Exception as e:
            print(f"Door stepping stopped on error: {e}")
        finally:
            try:
                io.set_motor(io.MOTOR_OFF)
            except Exception:
                pass
            #Only clear the flags if this is still the current move (a newer move may have replaced it)
            if self._thread is threading.current_thread():
                self.is_door_opening = False
                self.is_door_closing = False

    #Stop any move in progress and wait for the thread to finish (call with _cmd_lock held)
    def _halt(self):
        self._stop_event.set()
        thread = self._thread
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=2)
        try:
            io.set_motor(io.MOTOR_OFF)
        except Exception:
            pass
        self.is_door_opening = False
        self.is_door_closing = False
        self._thread = None

    #Start a move in the given direction (call with _cmd_lock held)
    def _start(self, direction):
        self._halt()
        self._stop_event = threading.Event()
        self.is_door_opening = (direction == OPEN_DIRECTION)
        self.is_door_closing = (direction == CLOSE_DIRECTION)
        self._thread = threading.Thread(target=self._run, args=(direction, self._stop_event), daemon=True)
        self._thread.start()

    #Open door
    def open_door(self):
        """
        Start opening the door if it's not already opening.

        Starts the stepping thread in OPEN_DIRECTION and updates the door status.
        """
        with self._cmd_lock:
            if not self.is_door_opening:
                self._start(OPEN_DIRECTION)
                print("Door opening started.")
            else:
                print("Door is already opening.")

    #Close door
    def close_door(self):
        """
        Start closing the door if it's not already closing.

        Starts the stepping thread in CLOSE_DIRECTION and updates the door status.
        """
        with self._cmd_lock:
            if not self.is_door_closing:
                self._start(CLOSE_DIRECTION)
                print("Door closing started.")
            else:
                print("Door is already closing.")

    #Stop the door
    def stop_door(self):
        """
        Stop the door movement.

        Stops the stepping thread, switches every coil off, and resets the door opening and closing status.
        """
        with self._cmd_lock:
            self._halt()

    #Check if door is fully open by checking Hall Effect sensors
    def is_door_fully_open(self):
        """
        Check if the door is fully open using Hall Effect sensors.
        This function is thread-safe when reading Hall Effect sensors.

        Returns:
            bool: True if the door is fully open, False otherwise.
        """
        with self.lock:
            return io.get_val('OPEN') == 0 and io.get_val('CLOSE') == 1

    #Check if door is fully closed by checking Hall Effect sensors
    def is_door_fully_closed(self):
        """
        Check if the door is fully closed using Hall Effect sensors.
        This function is thread-safe when reading Hall Effect sensors.

        Returns:
            bool: True if the door is fully closed, False otherwise.
        """
        with self.lock:
            return io.get_val('OPEN') == 1 and io.get_val('CLOSE') == 0


            
            
class dcControl:
 
    """
    A class to manage and control the state of the gate door.
    
    This class provides methods to initialize, open, close, and stop the door movement via the Motor control board pins.
    It also includes methods to check if the door is fully open or closed using Hall Effect sensors.
    """
    def __init__(self):
        #Keep track of door opening and closing states
        self.is_door_opening = False
        self.is_door_closing = False

        self.lock = threading.Lock()
        
        self.init_door()
        
    
    #Door initial state
    def init_door(self):
        """
        Initialize the door to its default state.

        Sets both control pins (IN3, IN4) to False (LOW), and resets the door opening and closing status.
        """
        io.set_val('ENB', True)
        io.set_val('IN3', False)
        io.set_val('IN4', False)
        self.is_door_opening = False
        self.is_door_closing = False
    
    #Open door
    def open_door(self):
        """
        Start opening the door if it's not already opening.

        Sets the appropriate control pin (IN4) to True to start the opening motion, and updates the door status
        """
        if not self.is_door_opening:
            io.set_val('IN3', False)
            io.set_val('IN4', True)
            self.is_door_opening = True
            self.is_door_closing = False
            print("Door opening started.")
        else:
            print("Door is already opening.")
    
    #Close door
    def close_door(self):
        """
        Start closing the door if it's not already closing.

        Sets the appropriate control pin (IN3) to True to start the closing motion, and updates the door status
        """
        if not self.is_door_closing:
            io.set_val('IN3', True)
            io.set_val('IN4', False)
            self.is_door_opening = False
            self.is_door_closing = True
        else:
            print("Door is already closing.")
    
    #Stop the door
    def stop_door(self):
        """
        Stop the door movement.

        Sets both control pins (IN3, IN4) to False to stop the door motion, and resets the door opening and closing status.
        """
        io.set_val('IN3', False)
        io.set_val('IN4', False)
        self.is_door_opening = False
        self.is_door_closing = False
    
    #Check if door is fully open by checking Hall Effect sensors
    def is_door_fully_open(self):
        """
        Check if the door is fully open using Hall Effect sensors.
        This function is thread-safe when reading Hall Effect sensors.

        Returns:
            bool: True if the door is fully open, False otherwise.
        """
        with self.lock:
            return io.get_val('OPEN') == 0 and io.get_val('CLOSE') == 1

    #Check if door is fully closed by checking Hall Effect sensors
    def is_door_fully_closed(self):
        """
        Check if the door is fully closed using Hall Effect sensors.
        This function is thread-safe when reading Hall Effect sensors.

        Returns:
            bool: True if the door is fully closed, False otherwise.
        """
        with self.lock:
            return io.get_val('OPEN') == 1 and io.get_val('CLOSE') == 0

if motor_mode == "stepper":
    DoorControl = stepperControl
elif motor_mode == "dc":
    DoorControl = dcControl
else:
    raise ValueError(f"Unknown motor mode:  {mode}")

