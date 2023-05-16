# Source: https://github.com/ArduCAM/RaspberryPi/blob/master/Motorized_Focus_Camera/python/AutofocusTest.py

import time
import signal
import cv2
import threading
from capture_image.RpiCamera import Camera
from capture_image.Focuser import Focuser
from capture_image.Autofocus import FocusState, doFocus

exit_ = False
def sigint_handler(signum, frame):
    global exit_
    exit_ = True

signal.signal(signal.SIGINT, sigint_handler)
signal.signal(signal.SIGTERM, sigint_handler)


if __name__ == "__main__":
    camera = Camera(width=4624, height=3472)
    camera.start_preview(False)
    focuser = Focuser(7)


    focusState = FocusState()
    doFocus(camera, focuser, focusState)

    start = time.time()
    frame_count = 0

    while not exit_:
        frame = camera.getFrame()
        img = cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)


        if focusState.isFinish() or time.time() - start > 5000:
            exit_ = True
            focusState.reset()
            doFocus(camera, focuser, focusState)
        
    cv2.imwrite("temp.jpg", cv2.cvtColor(camera.getFrame(), cv2.COLOR_BGR2RGB))
    camera.close()