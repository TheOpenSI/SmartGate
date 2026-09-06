import Jetson.GPIO as GPIO
import time

output_pins = [7, 16, 18]
input_pins  = [11, 13, 15]

GPIO.setmode(GPIO.BOARD)

try:
    for pin in output_pins:
        print(f"--- Testing pin {pin} as OUTPUT ---")
        GPIO.setup(pin, GPIO.OUT, initial=GPIO.LOW)

    for pin in input_pins:
        print(f"--- Testing pin {pin} as INPUT ---")
        GPIO.setup(pin, GPIO.IN)

    time.sleep(1)   # room to probe with a multimeter if needed

finally:
    for pin in output_pins:
        GPIO.output(pin, GPIO.LOW)
    GPIO.cleanup()
    print("Test complete — outputs forced LOW, GPIO released.")