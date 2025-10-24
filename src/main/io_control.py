import Jetson.GPIO as GPIO

# Dictionary of all GPIO pin names -> numbers
iPins = {
    'PIR': 15,
    'OPEN': 11,
    'CLOSE': 13
}

oPins = {
    'ENB': 12,
    'IN3': 16,
    'IN4': 18,
    'FAN': 7
}

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

# Changes the state of a provided GPIO pin name to the specified state
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

    :return: True after successfully setting up all pins.
    """
    GPIO.setmode(GPIO.BOARD)

    # Ouput pins
    for pin in oPins:
        GPIO.setup(oPins.get(pin), GPIO.OUT)

    # Input pins
    for pin in iPins:
        GPIO.setup(iPins.get(pin), GPIO.IN)
    
    return True

# Sets the state of all output pins to low
def all_pins_off():
    """
    Sets the state of all output pins to low.

    :return: True after setting all output pins to low.
    """
    set_val('ENB', False)
    set_val('IN3', False)
    set_val('IN4', False)
    return True