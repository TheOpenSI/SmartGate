import Jetson.GPIO as GPIO

# ---------------------------------------------------------------------------
# MOTOR MODE SWITCH
# Set to 'stepper' or 'dc' to choose which motor this file drives.
# You can also switch while the program is running with set_mode('dc') or set_mode('stepper').
# ---------------------------------------------------------------------------
MOTOR_MODE = 'stepper'

# Dictionary of all GPIO input pin names -> numbers (BOARD numbering)
iPins = {
    'PIR': 15,
    'OPEN': 11,
    'CLOSE': 13
}

# Output pins used in both modes
COMMON_PINS = {
    'FAN': 7
}

# Stepper mode: IN1..IN4 drive the stepper through the L298N board (Board B).
# Motor wiring: IN1 -> OUT1 (blue), IN2 -> OUT2 (yellow), IN3 -> OUT3 (purple), IN4 -> OUT4 (orange).
# The motor's white common wire goes to GND, so all four pins LOW means every coil is off.
# The ENA/ENB jumpers are fitted, so both channels are always enabled and ENB is not used.
STEPPER_PINS = {
    'IN1': 29,
    'IN2': 31,
    'IN3': 16,
    'IN4': 18
}

# DC mode: ENB, IN3 and IN4 drive the DC motor through channel B of the same L298N board.
# The ENB jumper must be removed and pin 12 wired to ENB for speed/enable control.
DC_PINS = {
    'ENB': 12,
    'IN3': 16,
    'IN4': 18
}

MODES = {
    'stepper': STEPPER_PINS,
    'dc': DC_PINS
}

# Stepper patterns are lists of four 0/1 values in the order [IN1, IN2, IN3, IN4]
MOTOR_OFF = [0, 0, 0, 0]

# DC patterns are lists of three 0/1 values in the order [ENB, IN3, IN4]
DC_FORWARD = [1, 1, 0]
DC_REVERSE = [1, 0, 1]
DC_OFF = [0, 0, 0]

# Filled in by _build_pins() for the current mode. These are updated in place,
# so other files that import them always see the current mode's pins.
oPins = {}
MOTOR_PINS = []

_pins_ready = False


def _build_pins(mode):
    """
    Rebuilds oPins and MOTOR_PINS for the given mode.

    :param mode: 'stepper' or 'dc'.
    """
    oPins.clear()
    oPins.update(MODES[mode])
    oPins.update(COMMON_PINS)

    MOTOR_PINS.clear()
    MOTOR_PINS.extend(MODES[mode].values())


# Build the pin set for the starting mode as soon as the file is imported
_build_pins(MOTOR_MODE)


# Returns the current motor mode
def get_mode():
    """
    Returns the current motor mode.

    :return: 'stepper' or 'dc'.
    """
    return MOTOR_MODE


# Switches between the stepper and the DC motor
def set_mode(mode):
    """
    Switches the motor mode. If the pins are already set up, the old motor is
    turned off and released, then the new motor's pins are set up starting LOW.

    :param mode: 'stepper' or 'dc'.

    :return: True if the mode was changed (or was already that mode), False if the mode is invalid.
    """
    global MOTOR_MODE

    if mode not in MODES:
        return False
    if mode == MOTOR_MODE:
        return True

    if _pins_ready:
        # Turn the old motor off and release its pins
        motor_off()
        GPIO.cleanup(list(MOTOR_PINS))

    MOTOR_MODE = mode
    _build_pins(mode)

    if _pins_ready:
        # Set up the new motor's pins, starting LOW
        for pin in MOTOR_PINS:
            GPIO.setup(pin, GPIO.OUT, initial=GPIO.LOW)

    return True


# Changes the state of a provided GPIO pin name to the specified state
def set_val(pinName, val):
    """
    Changes the state of a provided GPIO pin name to the specified state.
    Only pins that belong to the current mode (plus the fan) can be set.

    :param pinName: The name of the GPIO pin to set.
    :param val: The state to set the pin to (True for HIGH, False for LOW).

    :return: True if the pin state was successfully set, False otherwise.
    """
    if pinName in oPins and isinstance(val, bool):
        GPIO.output(oPins.get(pinName), val)
        return True
    else:
        return False


# Sets all four stepper pins in one call
def set_motor(pattern):
    """
    Sets the four stepper pins (IN1, IN2, IN3, IN4) to the given pattern in a single call.
    Only works in stepper mode.

    :param pattern: A list of four values (0/1) in the order [IN1, IN2, IN3, IN4].

    :return: True after the pins have been set, False if not in stepper mode or the pattern is the wrong length.
    """
    if MOTOR_MODE != 'stepper' or len(pattern) != len(MOTOR_PINS):
        return False
    GPIO.output(MOTOR_PINS, pattern)
    return True


# Sets the DC motor direction in one call
def set_dc(direction):
    """
    Drives the DC motor forward, in reverse, or stops it. Only works in DC mode.

    :param direction: 'forward', 'reverse' or 'stop'.

    :return: True if the pins were set, False if not in DC mode or the direction is invalid.
    """
    patterns = {
        'forward': DC_FORWARD,
        'reverse': DC_REVERSE,
        'stop': DC_OFF
    }
    if MOTOR_MODE != 'dc' or direction not in patterns:
        return False
    GPIO.output(MOTOR_PINS, patterns[direction])
    return True


# Turns off whichever motor is active
def motor_off():
    """
    Sets every pin of the active motor to low. In stepper mode this de-energises
    every coil, in DC mode it stops the motor.

    :return: True after the motor pins have been set low.
    """
    GPIO.output(MOTOR_PINS, [0] * len(MOTOR_PINS))
    return True


# Reads the state of a provided GPIO pin name
def get_val(pinName):
    """
    Reads the state of a provided GPIO pin name.

    :param pinName: The name of the GPIO pin to read.

    :return: The state of the pin (True for HIGH, False for LOW) if the pin exists,
             False if the pin doesn't exist in iPins.
    """
    if pinName in iPins:
        return GPIO.input(iPins.get(pinName))
    else:
        return False


# Configures all GPIO pins as in/outputs
def set_all_pins():
    """
    Configures all GPIO pins for the current mode as inputs or outputs.
    Output pins start LOW, so no motor is running at start-up.

    :return: True after successfully setting up all pins.
    """
    global _pins_ready

    GPIO.setmode(GPIO.BOARD)

    # Output pins (start LOW)
    for pin in oPins:
        GPIO.setup(oPins.get(pin), GPIO.OUT, initial=GPIO.LOW)

    # Input pins
    for pin in iPins:
        GPIO.setup(iPins.get(pin), GPIO.IN)

    _pins_ready = True
    return True


# Sets the state of all output pins to low
def all_pins_off():
    """
    Sets every output pin in the current mode to low: the active motor and the fan.

    :return: True after setting all of them to low.
    """
    for pin in oPins:
        set_val(pin, False)
    return True


# Turns everything off and releases the GPIO pins
def cleanup():
    """
    Sets all outputs low, then releases the GPIO pins. Call this when the program exits.

    :return: True after cleaning up.
    """
    global _pins_ready

    all_pins_off()
    GPIO.cleanup()
    _pins_ready = False
    return True
