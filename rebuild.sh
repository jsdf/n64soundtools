#!/bin/bash
set -eu
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

node $DIR/ic -o genmidi genmidi.inst

# node midicvt --blank ./remotesoundtool/soundtool-ui/public/b1n12ft.mid
node $DIR/midicvt --gm $DIR/remotesoundtool/iwantitthatway.mid --out $DIR/tst.seq
node $DIR/sbc $DIR/tst.seq 
cp $DIR/tst.sbk $DIR/remotesoundtool/sgisoundtest/tst.sbk 
