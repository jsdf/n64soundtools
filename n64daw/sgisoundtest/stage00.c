#include <assert.h>
#include <nusys.h>
#include "main.h"
#include "graphic.h"
#include "segment.h"

#include "ed64io.h"

#ifdef N_AUDIO
#include <nualsgi_n.h>
#else
#include <nualsgi.h>
#endif

static float theta;  /* The rotational angle of the square */
static float triPos_x; /* The display position, X */
static float triPos_y; /* The display position, Y */

/* Declaration of the prototype */
void shadetri(Dynamic* dynamicp);
void soundCheck(void); 


 
#define DEBUGPRINT 0
#if DEBUGPRINT
#define DBGPRINT ed64PrintfSync2
#else
#define DBGPRINT(args...)
#endif


#define MAX_SEQ_NO 2
#define MAX_SEQ_LENGTH  50000
#define NUM_CHANNELS 16

ALBankFile*  seqPlayerBankFile; // bank (samples) file for playing seqs
ALSeqFile* seqFile; // sequence bank header (w/ seq list) in audio heap
u8 *seqData; // region in audio heap to store currently playing sequence

// seq player state structure
ALSeqPlayer
    sequencePlayer,
    *seqPlayer = &sequencePlayer;

// seq state structure (not the same as the seq data, eg. the midi itself)
ALSeq
    sequence,
    *seqState = &sequence;

ALSeqpConfig  seqpConfig = {
  NU_AU_SEQ_VOICE_MAX,
  NU_AU_SEQ_EVENT_MAX,
  NU_AU_SEQ_CHANNEL_MAX,
  0,
  NULL,
  NULL,
  NULL,
  NULL
};

static u32 seqStartTime = 0;

static u8 chVolumes[NUM_CHANNELS];
static u8 chPrograms[NUM_CHANNELS];


int getMaxSeqNo() { 
  return seqFile->seqCount-1;
}

// debug window enum
#define DBG_CHANNELS 0
#define DBG_EVENTS 1
static int debugMidiEvents = TRUE;
static int debugMidiEventsParsed = TRUE;
static int debugMidiChannels = TRUE;

// load a sample bank file for a seq into the audio heap, then assign it to the seq player
// bank_addr: bank (.ctl) addr in rom
// bank_size: bank length in bytes
// table_addr: table (.tbl) addr in rom
void seqPlayerBankSet(u8* bank_addr, u32 bank_size, u8* table_addr)
{
  ALBank* bank_ptr;
  s32   cnt;
  int i,j,k;

  seqPlayerBankFile = nuAuHeapAlloc(bank_size);
  nuPiReadRom((u32)bank_addr, seqPlayerBankFile, bank_size);

  ed64PrintfSync2("bankCount %d\n", seqPlayerBankFile->bankCount);
  for (i = 0; i < seqPlayerBankFile->bankCount; ++i)
  {
    u32 offset = seqPlayerBankFile->bankArray[i];
    ed64PrintfSync2("bank %d offset=%d p=%p\n", i, offset, bank_addr + offset);
  }
  
  alBnkfNew(seqPlayerBankFile, table_addr);
  bank_ptr = seqPlayerBankFile->bankArray[0];

  for (i = 0; i < seqPlayerBankFile->bankCount; ++i) {
    ALBank * bank = (ALBank *)seqPlayerBankFile->bankArray[i];
    ed64PrintfSync2("bank %d p=%x sampleRate=%d\n", i, bank, bank->sampleRate);
    for (j = 0; j < bank->instCount; ++j) {
      ALInstrument * inst = (ALInstrument *)bank->instArray[j];
      ed64PrintfSync2("inst %d p=%x\n", j, inst);

      for (k = 0; k < inst->soundCount; ++k) {
        ALSound * sound = (ALSound *)inst->soundArray[k];
        ed64PrintfSync2("sound %d p=%x\n", j, sound);
        ed64PrintfSync2("wavetable type=%u\n",  sound->wavetable->type);
        break;
      }
      break;
    } 
    break;
  }
  

  alSeqpSetBank(seqPlayer, bank_ptr);
}

// load a seq file to the audio heap and init it 
// seq_addr: seq file (.sbk) addr in ROM
void seqPlayerLoadSeqBank(u8* seq_addr)
{
  u8    data[32];  // temporary storage for seq header
  ALSeqFile*  seqFile_ptr; // pointer to interpret seqfile header data as seq file
  s32   seqFileHeaderSize;

  // read 4 bytes of seq file header only, so we can get the number of seqs
  seqFile_ptr = OS_DCACHE_ROUNDUP_ADDR(data);
  nuPiReadRom((u32)seq_addr, seqFile_ptr, 4);

  // calculate actual size to alloc in audio heap and read full header (incl seqArray)
  seqFileHeaderSize = 4 + seqFile_ptr->seqCount * sizeof(ALSeqData);
  seqFile = nuAuHeapAlloc(seqFileHeaderSize);
  nuPiReadRom((u32)seq_addr, seqFile, seqFileHeaderSize);

  alSeqFileNew(seqFile, seq_addr); 
}


// load a particular sequence in the seq file from ROM to the audio heap, then
// attach it to the seq player
// seq_no: the index of the seq in the seq bank file
void seqPlayerSetNo(u32 seq_no)
{
  s32 dataLen;
  u8* dataOffset;
  int i;

#ifdef NU_DEBUG
    if(seq_no >=  seqFile->seqCount){
  osSyncPrintf("seqPlayerSetNo: seq_no %d is too big.\n", seq_no);
  return;
    }
#endif /* NU_DEBUG */ 

  /* Get address and size of sequence data from header */
  dataOffset = seqFile->seqArray[seq_no].offset;
  dataLen    = seqFile->seqArray[seq_no].len;

  /* If size is odd number it can't be transferred by PI, so make it an even number */
  if(dataLen & 0x00000001) dataLen++;

  nuPiReadRom((u32)dataOffset, seqData, dataLen);

  // init seq state struct for the loaded data
  alSeqNew(seqState, seqData, dataLen);
  // set sequence player active seq to new seq state struct
  alSeqpSetSeq(seqPlayer, seqState);

  alSeqpSetVol(seqPlayer, 0x7fff/2); // 50% initial vol  
 
  // alSeqpSetTempo(seqPlayer, 120); // set default tempo so we don't divide by 0
}

// load sample bank and seq bank index at startup
void initSeqPlayerData() {
  int i;
  seqpConfig.heap = &nuAuHeap;
  // init sequence player state
  alSeqpNew(seqPlayer, &seqpConfig);

  // load seq sample bank index, and attach it to the seq player
  seqPlayerBankSet(_midibankSegmentRomStart,
           _midibankSegmentRomEnd - _midibankSegmentRomStart,
           _miditableSegmentRomStart);

  // load MIDI sequence bank file
  seqPlayerLoadSeqBank(_seqSegmentRomStart);

  // allocate audio heap space for sequence data
  seqData = (u8*)nuAuHeapAlloc(MAX_SEQ_LENGTH);

  seqPlayerSetNo(0); // load the seq data and attach to seqPlayer
  alSeqpPlay(seqPlayer);
}

#define USB_BUFFER_SIZE 128

typedef struct MIDIMessage
{
  u32 time;
  u8 status;
  u8 data1;
  u8 data2;
} MIDIMessage;

#define MSGTYPE_MSTA 0x4D535441
#define MSGTYPE_MMID 0x4D4D4944

static char escChar(char in) {
  if (in > 31 && in < 127) {
    return in;
  }
  return '_';
}

typedef enum MidiEventType {
  ControlChangeMidiEvent,
  ProgramChangeMidiEvent,
  NoteOnMidiEvent,
  NoteOffMidiEvent,
  OtherMidiEvent,
} MidiEventType;

char* MidiEventTypeStrings[] = {
  "cc     ",
  "progch ",
  "noteon ",
  "noteoff", 
  "other  "
};


MidiEventType getMidiEventType(status) {
  switch (status >> 4) {
    case 0xb:
      return ControlChangeMidiEvent;
    case 0xc:
      return ProgramChangeMidiEvent;
    case 0x9:
      return NoteOnMidiEvent;
    case 0x8:
      return NoteOffMidiEvent;
  }
  return OtherMidiEvent;
}

void playMidi(u8 midiMsgStart[], u32 seqTimeOffset) {
  u32 *midiMsgTimePtr = (u32*)((void *)midiMsgStart);
  u32 midiMsgTime = *midiMsgTimePtr;
  u8 midiMsgStatus = midiMsgStart[4];
  u8 midiMsgData1 = midiMsgStart[5];
  u8 midiMsgData2 = midiMsgStart[6];
  u32 seqTimeOffsetUSRel = midiMsgTime - seqTimeOffset; 
  s32 tempo = alSeqpGetTempo(seqPlayer);
  // s32 tempo = 120;
  u32 ticks = alSeqSecToTicks(seqState, seqTimeOffsetUSRel/1000000.0f, tempo);
  MidiEventType eventType = getMidiEventType(midiMsgStatus);
  u32 channel = midiMsgStatus & 0xf;
  u8 volBeforeEvent = 0;

  if (eventType == ProgramChangeMidiEvent)  {
    volBeforeEvent = alSeqpGetChlVol(seqPlayer, channel);
  }

  DBGPRINT("midimsg tempo=%d seqTimeOffsetUSRel=%d midi=%x %x %x\n",tempo,seqTimeOffsetUSRel, midiMsgStatus, midiMsgData1, midiMsgData2);
  if (debugMidiEvents) {
    if (debugMidiEventsParsed) {
      char* eventTypeStr = MidiEventTypeStrings[eventType];
      nuDebConPrintf(DBG_EVENTS, "ch%2u %s %3u %3u\n", channel, eventTypeStr, midiMsgData1, midiMsgData2); 
    } else {
      nuDebConPrintf(DBG_EVENTS, "0x%02x%02x%02x @ %ums\n", midiMsgStatus, midiMsgData1, midiMsgData2, midiMsgTime/1000); 
    }
  }

  alSeqpSendMidi(seqPlayer, ticks, midiMsgStatus, midiMsgData1, midiMsgData2);

  if (eventType == ProgramChangeMidiEvent)  {
    // fix volume after program change 
    alSeqpSendMidi(seqPlayer, ticks, (0xb<<4) + channel, 7, volBeforeEvent);
  }
          
}

int ed64SoundtestUsbListener() { 
  int * msgType;
  int i;
  int offset;
  u32 usb_rx_buff32[USB_BUFFER_SIZE];
  char* usb_rx_buff8 = (char*)usb_rx_buff32;
  memset(usb_rx_buff8, 0, USB_BUFFER_SIZE * 4);

  if (evd_fifoRxf())  // when pin low, receive buffer not empty yet
    // DBGPRINT("rx buffer empty\n");
    return FALSE;

  DBGPRINT("starting read\n");
  // returns timeout error, at which time we just try again
  while (evd_fifoRd(usb_rx_buff32, 1)) {
    DBGPRINT("sleeping\n");
    evd_sleep(100);
  }
  DBGPRINT("dma read done\n");

  DBGPRINT("message: %c%c%c%c\n", escChar(usb_rx_buff8[0]), escChar(usb_rx_buff8[1]),
           escChar(usb_rx_buff8[2]), escChar(usb_rx_buff8[3]));

  msgType = (u32*)(void*)usb_rx_buff8;
  switch (*msgType) {
    case MSGTYPE_MSTA:
      seqStartTime = OS_CYCLES_TO_USEC(osGetTime());
      return FALSE;
    case MSGTYPE_MMID: {
        u32 midiMsgCount = *(u32 *)(usb_rx_buff8 + 4);
        // MIDIMessage * midiMsg = (MIDIMessage *)(usb_rx_buff8 + 8);
        u32 seqTimeOffset = OS_CYCLES_TO_USEC(osGetTime()) - seqStartTime;
        DBGPRINT("midiMsgCount=%d\n", midiMsgCount);
        for (i = 0; i < midiMsgCount; ++i) {
          offset = (8 + 8 * i);
          DBGPRINT("midiMsg %d offset=%d ptr=%p base=%p\n", i, offset, usb_rx_buff8 + offset, usb_rx_buff8);
          playMidi(usb_rx_buff8 + offset, seqTimeOffset);
        }
        return FALSE;
      }
    default:
      DBGPRINT("invalid command: %c%c%c%c\n", escChar(usb_rx_buff8[0]), escChar(usb_rx_buff8[1]),
           escChar(usb_rx_buff8[2]), escChar(usb_rx_buff8[3])); 
      return FALSE;
  }


  return FALSE;
}

/* The initialization of stage 0 */
void initStage00(void)
{
  int i = 0;
  triPos_x = 0.0;
  triPos_y = 0.0;
  theta = 0.0;
  initSeqPlayerData();


  // cols 0-19
  nuDebConClear(DBG_EVENTS);
  nuDebConWindowPos(DBG_EVENTS, 3, 3);
  // nuDebConWindowSize(DBG_EVENTS, 20-4, 30-4);
  // cols 20-40
  nuDebConClear(DBG_CHANNELS);
  nuDebConWindowPos(DBG_CHANNELS, 3, 3);
  // nuDebConWindowSize(DBG_CHANNELS, 20-4, 30-4);
  
  for (i = 0 ; i < NUM_CHANNELS; i++) {
    chVolumes[i] = 0;
    chPrograms[i] = 0;
  }
}

static int initialized = FALSE;
static int snd_no = 0;
static int seq_no = 0;

/* Make the display list and activate the task */
void makeDL00(void)
{
  Dynamic* dynamicp;
  char conbuf[20]; 
  int i;

  /* Specify the display list buffer */
  dynamicp = &gfx_dynamic[gfx_gtask_no];
  glistp = &gfx_glist[gfx_gtask_no][0];

  if (!initialized) {
    ALSeqFile * seqFile = (ALSeqFile*)_seqSegmentRomStart;

    ed64PrintfSync2("seqFile=%x, _seqSegmentRomStart=%x, triPos_y=%x\n", seqFile, &_seqSegmentRomStart, &triPos_y);

    initialized = TRUE;
  }

  /* The initialization of RCP */
  gfxRCPInit();

  /* Clear the frame and Z-buffer */
  gfxClearCfb();

  /* projection,modeling matrix set */
  guOrtho(&dynamicp->projection,
	  -(float)SCREEN_WD/2.0F, (float)SCREEN_WD/2.0F,
	  -(float)SCREEN_HT/2.0F, (float)SCREEN_HT/2.0F,
	  1.0F, 10.0F, 1.0F);
  guRotate(&dynamicp->modeling, theta, 0.0F, 0.0F, 1.0F);
  guTranslate(&dynamicp->translate, triPos_x, triPos_y, 0.0F);

  /*  Draw a square */
  shadetri(dynamicp);

  gDPFullSync(glistp++);
  gSPEndDisplayList(glistp++);

  assert((glistp - gfx_glist[gfx_gtask_no]) < GFX_GLIST_LEN);

  /* Activate the task and 
     switch display buffers. */
  nuGfxTaskStart(&gfx_glist[gfx_gtask_no][0],
		 (s32)(glistp - gfx_glist[gfx_gtask_no]) * sizeof (Gfx),
		 NU_GFX_UCODE_F3DEX , NU_SC_NOSWAPBUFFER);

  if(contPattern & 0x1)
    {
      /* Change character representation positions */
      // nuDebConTextPos(0,12,23);
      // sprintf(conbuf,"triPos_x=%5.1f",triPos_x);
      // nuDebConCPuts(0, conbuf);

      // nuDebConTextPos(0,12,24);
      // sprintf(conbuf,"triPos_y=%5.1f",triPos_y);
      // nuDebConCPuts(0, conbuf);

      // nuDebConTextPos(0,12,25);
      // sprintf(conbuf,"seq_no=%d max_seq_no=%d",seq_no, getMaxSeqNo());
      // nuDebConCPuts(0, conbuf);
      
    }
  else
    {
      nuDebConTextPos(0,9,24);
      nuDebConCPuts(0, "Controller1 not connect");
    }

  if (debugMidiChannels) {
    for (i = 0; i < NUM_CHANNELS; i++){ 
      nuDebConTextPos(DBG_CHANNELS, 21, 2 + i);
      nuDebConPrintf(DBG_CHANNELS, "ch%2d v%3d p%3d\n", i, chVolumes[i], chPrograms[i]);
    }
  }
    
  /* Draw characters on the frame buffer */
  nuDebConDisp(NU_SC_SWAPBUFFER);

  /* Switch display list buffers */
  gfx_gtask_no ^= 1;
}


/* The game progressing process for stage 0 */
void updateGame00(void)
{  
  static float vel = 1.0;
  int i;

  /* The game progressing process for stage 0 */
  nuContDataGetEx(contdata,0);

  soundCheck();

  /* Change the display position by stick data */
  triPos_x = contdata->stick_x;
  triPos_y = contdata->stick_y;

  /* The reverse rotation by the A button */
  if(contdata[0].trigger & A_BUTTON)
    {
      // vel = -vel;
      alSeqpStop(seqPlayer);
      osSyncPrintf("MIDI panic\n");
      alSeqpPlay(seqPlayer);
    }

  /* Rotate fast while the B button is pushed */
  if(contdata[0].button & B_BUTTON)
    theta += vel * 3.0;
  else
    theta += vel;

  for(i = 0; i < NUM_CHANNELS; i++) {
    chVolumes[i] = alSeqpGetChlVol(seqPlayer, i);
    chPrograms[i] = alSeqpGetChlProgram(seqPlayer, i);
  }
#ifdef REMOTE_MIDI
  ed64SoundtestUsbListener();
#endif
}

/* The vertex coordinate */
static Vtx shade_vtx[] =  {
        {        -64,  64, -5, 0, 0, 0, 0, 0xff, 0, 0xff	},
        {         64,  64, -5, 0, 0, 0, 0, 0, 0, 0xff	},
        {         64, -64, -5, 0, 0, 0, 0, 0, 0xff, 0xff	},
        {        -64, -64, -5, 0, 0, 0, 0xff, 0, 0, 0xff	},
};

/* Drew a square */
void shadetri(Dynamic* dynamicp)
{
  gSPMatrix(glistp++,OS_K0_TO_PHYSICAL(&(dynamicp->projection)),
		G_MTX_PROJECTION|G_MTX_LOAD|G_MTX_NOPUSH);
  gSPMatrix(glistp++,OS_K0_TO_PHYSICAL(&(dynamicp->translate)),
		G_MTX_MODELVIEW|G_MTX_LOAD|G_MTX_NOPUSH);
  gSPMatrix(glistp++,OS_K0_TO_PHYSICAL(&(dynamicp->modeling)),
		G_MTX_MODELVIEW|G_MTX_MUL|G_MTX_NOPUSH);

  gSPVertex(glistp++,&(shade_vtx[0]),4, 0);

  gDPPipeSync(glistp++);
  gDPSetCycleType(glistp++,G_CYC_1CYCLE);
  gDPSetRenderMode(glistp++,G_RM_AA_OPA_SURF, G_RM_AA_OPA_SURF2);
  gSPClearGeometryMode(glistp++,0xFFFFFFFF);
  gSPSetGeometryMode(glistp++,G_SHADE| G_SHADING_SMOOTH);

  gSP2Triangles(glistp++,0,1,2,0,0,2,3,0);
}


/* Provide playback and control of audio by the button of the controller */
void soundCheck(void)
{

  /* Change music of sequence playback depending on the top and bottom of 
  the cross key */
  if((contdata[0].trigger & U_JPAD) || (contdata[0].trigger & D_JPAD))
    {
      if(contdata[0].trigger & U_JPAD)
	{
	  seq_no--;
	  if(seq_no < 0) seq_no = getMaxSeqNo();
	}
      else
	{
	  seq_no++;
	  if(seq_no > getMaxSeqNo()) seq_no = 0;
	}	  
      alSeqpStop(seqPlayer);
      seqPlayerSetNo(seq_no); // load the seq data and attach to seqPlayer
      alSeqpPlay(seqPlayer);
    }

  /* Possible to play audio in order by right and left of the cross key */
  if((contdata[0].trigger & L_JPAD) || (contdata[0].trigger & R_JPAD))
    {
      if(contdata[0].trigger & L_JPAD)
	{
	  snd_no--;
	  if(snd_no < 0) snd_no = 10;
	}
      else
	{
	  snd_no++;
	  if(snd_no > 10) snd_no = 0;
	}	  

      /* Eleven sounds (sound data items) are provided.  Of these, the first 10 are sampled at 44 KHz and the 11th at 24 KHz. */
      nuAuSndPlayerPlay(snd_no); 
      if(snd_no < 10)
	nuAuSndPlayerSetPitch(44100.0/32000);
      else
	nuAuSndPlayerSetPitch(24000.0/32000);
    }

  /* Change tempo of sequence playback by the L and R buttons */
  if((contdata[0].trigger & L_TRIG) || (contdata[0].trigger & R_TRIG))
    {
      s32 tmp;
      tmp = nuAuSeqPlayerGetTempo(0);

      if(contdata[0].trigger & L_TRIG)
	{
	  tmp /= 10;
	  tmp *= 8;
	}
      else
	{
	  tmp /= 10;
	  tmp *= 12;
	}
      nuAuSeqPlayerSetTempo(0,tmp);
    }

  /* Fade out sound by pushing the Z button */
  if(contdata[0].trigger & Z_TRIG)
    {
      nuAuSeqPlayerFadeOut(0,200);
    }
} 

