var STATUS = {
	KNOB: 0xB0, // upto 0xBF, 16 midi channels in pure mode (midi 0)
	CONTROL: 0xB0,

	MIDI0: {
		PAD_ON: 0x99,
		PAD_OFF: 0x89,

		NOTE_ON: 0x90,
		NOTE_OFF: 0x80,
	},
	MIDI1: {
		IN_CONTROL: 0x90,

		PAD_ON: 0x90,
		PAD_OFF: 0x80,

		START_ON: 0x90,
		START_OFF: 0x80,
	},
};

var CC = {
	KNOB1: 0x15,
	KNOB8: 0x1C,

	MIDI0: {
		PAD1: 0x24,
		PAD16: 0x33,

		PLAY: 0x6C,
		STOP: 0x6D,
	},
	MIDI1: {
		IN_CONTROL: 0x0C,

		PAD1: 0x60,
		PAD8: 0x67,
		PAD9: 0x70,
		PAD16: 0x77,

		PLAY: 0x68,
		STOP: 0x78,

		PREV_SCENE: 0x68,
		NEXT_SCENE: 0x69,
		PREV_TRACK: 0x6A,
		NEXT_TRACK: 0x6B,
	},
};
