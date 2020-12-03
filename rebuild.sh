#!/bin/bash
node midicvt --blank /Users/jfriend/.wine/drive_c/goose64/music/b1n12ft3.mid
node sbc tst.seq
# node sbc Silence.mid
cp tst.sbk /Users/jfriend/.wine/drive_c/sgisoundtest/tst.sbk 
