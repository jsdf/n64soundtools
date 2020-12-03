/*
   main.c

   NuSYSTEM sample nu3 

   Copyright (C) 1997-1999, NINTENDO Co,Ltd.	
   */

#include <nusys.h>
#include "main.h"
#include "segment.h"

#ifdef N_AUDIO
#include <nualsgi_n.h>
#else
#include <nualsgi.h>
#endif

#include "ed64io.h"

/* Declaration of the prototype  */
void stage00(int);
void setAudioData(void);

/* Declaration of the external function  */
void initStage00(void);
void makeDL00(void);
void updateGame00(void);

/* The global variable  */
NUContData contdata[1];		/* Read data of 1 controller  */
u8 contPattern;	     /* The bit pattern of the connected controller  */
 


ALSynConfig auSynConfig = {
    NU_AU_SYN_VVOICE_MAX, /* Number of virtual voices (not used)  */
    NU_AU_SYN_PVOICE_MAX, /* Number of physical voices      */
    NU_AU_SYN_UPDATE_MAX, /* Maximum number of updates      */
    0,
    NULL,     /*DMA initialization callback function  */
    NULL,     /* Heap structure     */
    44100,  /* Output frequency reset by the program */
    AL_FX_NONE,   /* Sound effects    */
    0,        /* Custom effects   */
};

s32 auInit(void)
{
    /* Initialize the Audio Manager.  */
    nuAuMgrInit((void*)NU_AU_HEAP_ADDR, NU_AU_HEAP_SIZE, &auSynConfig);

    /* Initialize the Sequence Player.  */
    // nuAuSeqPlayerInit(&nuAuSeqpConfig, 0x8000, NU_AU_SEQ_PLAYER0);

    /* Initialize the Sequence Player.  */
    // nuAuSeqPlayerInit(&nuAuSeqpConfig, 0x8000, NU_AU_SEQ_PLAYER1);

    /* Initialize the Sound Player. */
    nuAuSndPlayerInit(&nuAuSndpConfig);

    /* Initialize the audio control callback function. */
    // nuAuMgrFuncSet(nuAuSeqPlayerControl);

    /* Register the PRE NMI processing function.  */
    // nuAuPreNMIFuncSet(nuAuPreNMIProc);

    /* Return the size of the heap area used. */
    return nuAuHeapGetUsed();
}

/*------------------------
	Main
--------------------------*/
void mainproc(void)
{

  // start everdrive communication
  evd_init();

  // register libultra error handler
  ed64RegisterOSErrorHandler();

  ed64ReplaceOSSyncPrintf();

  // start thread which will catch and log errors
  ed64StartFaultHandlerThread(NU_GFX_TASKMGR_THREAD_PRI);

  /* The initialization of graphic  */
  nuGfxInit();

  /* The initialization of the controller manager  */
  contPattern = nuContInit();

  /* The initialization of audio  */
  auInit();
  /* Register audio data on ROM  */
  setAudioData();

  /* The initialization for stage00()  */
  initStage00();
  /* Call-back register  */
  nuGfxFuncSet((NUGfxFunc)stage00);
  /* Screen display ON*/
  nuGfxDisplayOn();

  while(1)
    ;
}

/* Set audio data  */
void setAudioData(void)
{
  /* Register the bank to the sequence player  */
  // nuAuSeqPlayerBankSet(_midibankSegmentRomStart,
		//        _midibankSegmentRomEnd - _midibankSegmentRomStart,
		//        _miditableSegmentRomStart);
  /* Register MIDI sequence data to the sequence player */
  // nuAuSeqPlayerSeqSet(_seqSegmentRomStart);
  /* Register the bank to the sound player  */
  nuAuSndPlayerBankSet(_sfxbankSegmentRomStart,
		       _sfxbankSegmentRomEnd - _sfxbankSegmentRomStart,
		       _sfxtableSegmentRomStart);
}

/*-----------------------------------------------------------------------------
  The call-back function 

  pendingGfx which is passed from Nusystem as the argument of the call-back 
  function is the total number of RCP tasks that are currently processing
  and waiting for the process.  
-----------------------------------------------------------------------------*/
void stage00(int pendingGfx)
{
  /* Provide the display process if 2 or less RCP tasks are processing or 
	waiting for the process.  */
  if(pendingGfx < 3)
    makeDL00();		

  /* The process of game progress */
  updateGame00(); 
}


