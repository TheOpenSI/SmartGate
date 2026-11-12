#!/bin/bash

set -x

/usr/bin/busybox devmem  0x243D020 w 0x5
/usr/bin/busybox devmem  0x243D010 w 0x5
/usr/bin/busybox devmem  0x2430068 w 0x8
/usr/bin/busybox devmem  0x2430070 w 0x8


