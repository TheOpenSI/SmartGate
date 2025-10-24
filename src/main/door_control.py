import io_control as io
import time
import threading

#This class is used to set and control the state of the door of the gate

class DoorControl:
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
