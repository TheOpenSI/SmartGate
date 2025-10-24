#This module implements a rule-based decision system for controlling the next state in the state machine for the gate
#It will read from a JSON file that has the rules set accordingly
import json
from gate_states import State

class RulesetDecider:
    """
    Reads rules from the specified ruleset configuration, obtained from the JSON config file, and uses it to determine the appropriate state transition based on detected objects

    :param rules_config: Ruleset dictionary (read json_config.py to see format)
    """
    def __init__(self, rules_config):
        self.rules = rules_config

    def decide(self, object_list: list) -> State:
        """
        Responsible for deciding and setting the appropriate state transition based on the detected objects.

        :param object_list: List of detected objects obtained from detection model
        :return: The next state based on the detected objects of type `State` enum
        """
        #Check the rules accordingly and set the state
        open_detected  = False
        close_detected = False

        for rule in self.rules:
            for obj in object_list:
                if obj in rule['objects']:
                    if rule['action'] == 'OPEN':
                        open_detected = True
                    elif rule['action'] == 'CLOSE':
                        close_detected = True

        #Decision Logic
        if close_detected and open_detected:
            return State.DOOR_CLOSE
        elif open_detected:
            return State.DOOR_OPEN
        elif close_detected:
            return State.DOOR_CLOSE
        
        return State.IDLE