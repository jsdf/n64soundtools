#!/bin/bash
node midicvt --blank ./remotesoundtool/soundtool-ui/public/b1n12ft.mid
node sbc tst.seq
# node sbc Silence.mid
cp tst.sbk ./remotesoundtool/sgisoundtest/tst.sbk 
