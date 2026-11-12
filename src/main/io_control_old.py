import Jetson.GPIO as GPIO

# Dictionary of all GPIO pin names -> numbers (BOARD numbering)
iPins = {
    'PIR': 15,
    'OPEN': 11,
    'CLOSE': 13
}

# IN1..IN4 drive the stepper motor through the L298N board (Board B).
# Motor wiring: IN1 -> OUT1 (blue), IN2 -> OUT2 (yellow), IN3 -> OUT3 (purple), IN4 -> OUT4 (orange).
# The motor's white common wire goes to GND, so all four pins LOW means every coil is off.
# ENB is no longer used: the L298N ENA/ENB jumpers are fitted, so both channels are always enabled.
oPins = {
    'IN1': 29,
    'IN2': 31,
    'IN3': 16,
    'IN4': 18,
    'FAN': 7
}

# Motor pins in coil order [IN1, IN2, IN3, IN4]. A step pattern is a list of four 0/1 values in this order.
MOTOR_PINS = [oPins['IN1'], oPins['IN2'], oPins['IN3'], oPins['IN4']]
MOTOR_OFF = [0, 0, 0, 0]

# Changes the state of a provided GPIO pin name to the specified state
def set_val(pinName, val):
    """
    Changes the state of a provided GPIO pin name to the specified state.

    :param pinName: The name of the GPIO pin to set.
    :param val: The state to set the pin to (True for HIGH, False for LOW).

    :return: True if the pin state was successfully set, False otherwise.
    """
    if pinName in oPins and isinstance(val, bool):
        GPIO.output(oPins.get(pinName), val)
        return True
    else:
        return False

# Sets all four motor pins in one call
def set_motor(pattern):
    """
    Sets the four motor pins (IN1, IN2, IN3, IN4) to the given pattern in a single call.

    :param pattern: A list of four values (0/1) in the order [IN1, IN2, IN3, IN4].

    :return: True after the pins have been set.
    """
    GPIO.output(MOTOR_PINS, pattern)
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
    Configures all GPIO pins as inputs or outputs based on their definitions.
    Output pins start LOW, so no motor coil is energised at start-up.

    :return: True after successfully setting up all pins.
    """
    GPIO.setmode(GPIO.BOARD)

    # Ouput pins (start LOW)
    for pin in oPins:
        GPIO.setup(oPins.get(pin), GPIO.OUT, initial=GPIO.LOW)

    # Input pins
    for pin in iPins:
        GPIO.setup(iPins.get(pin), GPIO.IN)

    return True

# Sets the state of all output pins to low
def all_pins_off():
    """
    Sets all four motor pins to low, which de-energises every motor coil, and the fan pin to low.

    :return: True after setting all of them to low.
    """
    set_motor(MOTOR_OFF)
    set_val('FAN', False)
    return True

