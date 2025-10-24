#The different states in the SmartGate state machine
from enum import Enum, auto

class State(Enum):
    IDLE       = auto()
    DETECT     = auto()
    DECISION   = auto()
    DOOR_OPEN  = auto()
    DOOR_CLOSE = auto()
    DELAY      = auto()
