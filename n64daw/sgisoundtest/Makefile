include $(ROOT)/usr/include/make/PRdefs

# The directory which has the include file and library of NuSYSTEM
#
N64KITDIR    = c:\nintendo\n64kit
NUSYSINCDIR  = $(N64KITDIR)/nusys/include
NUSYSLIBDIR  = $(N64KITDIR)/nusys/lib

LIB = $(ROOT)/usr/lib
LPR = $(LIB)/PR
INC = $(ROOT)/usr/include
CC  = gcc
LD  = ld
MAKEROM = mild

# When you use the former audio micro codes,
# please comment this out.
# N_AUDIO = yes

ifdef N_AUDIO
NUAUDIOLIB = -lnualsgi_n_d -lgn_audio_d
else
NUAUDIOLIB = -lnualsgi_d
endif

LCDEFS =	-DNU_DEBUG -DF3DEX_GBI_2
ifdef N_AUDIO
LCDEFS += -DN_AUDIO
endif
ifdef ED64
LCDEFS += -DED64
endif
ifdef REMOTE_MIDI
LCDEFS += -DREMOTE_MIDI
endif
LCINCS =	-I. -I$(NUSYSINCDIR) -I$(ROOT)/usr/include/PR
LCOPTS =	-G 0
LDFLAGS =	$(MKDEPOPT) -L$(LIB) -L$(NUSYSLIBDIR) $(NUAUDIOLIB) -lnusys_d -lgultra_d -L$(GCCDIR)/mipse/lib -lkmc

OPTIMIZER =	-g

APP =		soundtest.out

TARGETS =	soundtest.n64

HFILES =	main.h graphic.h segment.h

CODEFILES   = 	main.c stage00.c graphic.c gfxinit.c  $(wildcard ed64io_*.c)

CODEOBJECTS =	$(CODEFILES:.c=.o)  $(NUSYSLIBDIR)/nusys.o

DATAFILES   =	

DATAOBJECTS =	$(DATAFILES:.c=.o)

CODESEGMENT =	codesegment.o

OBJECTS =	$(CODESEGMENT) $(DATAOBJECTS)


default:        $(TARGETS)

include $(COMMONRULES)

$(CODESEGMENT):	$(CODEOBJECTS) Makefile
		$(LD) -o $(CODESEGMENT) -r $(CODEOBJECTS) $(LDFLAGS)

$(TARGETS):	$(OBJECTS)
		$(MAKEROM) spec -I$(NUSYSINCDIR) -r $(TARGETS) -e $(APP) -E
		makemask $(TARGETS) 
