loadAPI(3);

load("launchkey-vars.js");
load("launchkey-leds.js");

// Remove this if you want to be able to use deprecated methods without causing script to stop.
// This is useful during development.
host.setShouldFailOnDeprecatedUse(true);

host.defineController("Novation", "Launchkey Mini MK2", "0.1", "261631f0-b8f9-4d69-8304-045d9fa6bb65", "voidex");
host.defineMidiPorts(2, 2);
host.addDeviceNameBasedDiscoveryPair(
	["Launchkey Mini", "MIDIIN2 (Launchkey Mini)"],
	["Launchkey Mini", "MIDIOUT2 (Launchkey Mini)"]
);

var startPressed = false;
var pagesShown = false;

let PAGES_SHOW_DELAY = 200;

function init() {
	transport = host.createTransport();
	application = host.createApplication();
	trackBank = host.createTrackBank(8, 1, 1);

	sceneBank = trackBank.sceneBank();
	sceneBank.getScene(0).sceneIndex().markInterested();
	cursorTrack = host.createCursorTrack(2, 1);
	cursorTrack.clipLauncherSlotBank().cursorIndex().markInterested();
	cursorTrack.clipLauncherSlotBank().scrollPosition().markInterested();

	trackBank.followCursorTrack(cursorTrack);

	cursorDecive = cursorTrack.createCursorDevice("Primary", "Primary", 8, CursorDeviceFollowMode.FOLLOW_SELECTION);
	drumPadBank = cursorDecive.createDrumPadBank(16);
	remoteControlsPage = cursorDecive.createCursorRemoteControlsPage(8);
	remoteControlsPage.pageNames().markInterested();
	arranger = host.createArranger(0);

	trackBank.getClipLauncherScenes().itemCount().markInterested();

	drumPadBank.channelScrollPosition().markInterested();
	remoteControlsPage.selectedPageIndex().markInterested();

	transport.isPlaying().addValueObserver(function(on) {
		setLED(CC.MIDI1.PLAY, on ? mkRed(3) : 0);
		setLED(CC.MIDI1.STOP, on ? 0 : mkRed(3));
	});

	for (var p = 0; p < 8; ++p) {
		trackBank.getChannel(p).exists().markInterested();
		trackBank.getChannel(p).clipLauncherSlotBank().getItemAt(0).hasContent().markInterested();
		trackBank.getChannel(p).clipLauncherSlotBank().getItemAt(0).isPlaying().markInterested();
		trackBank.getChannel(p).clipLauncherSlotBank().getItemAt(0).isPlaybackQueued().markInterested();
		trackBank.getChannel(p).clipLauncherSlotBank().getItemAt(0).isRecording().markInterested();
		trackBank.getChannel(p).clipLauncherSlotBank().getItemAt(0).isRecordingQueued().markInterested();
		trackBank.getChannel(p).isStopped().markInterested();

		let idx = p;
		trackBank.getChannel(p).clipLauncherSlotBank().addPlaybackStateObserver(function(slotIndex, state, queued) {
			updateChannelLEDs(idx);
		});
		trackBank.getChannel(p).clipLauncherSlotBank().addHasContentObserver(function(slotIndex, has) {
			updateChannelLEDs(idx);
		})
		trackBank.getChannel(p).isStopped().addValueObserver(function(stopped) {
			updateChannelLEDs(idx);
		})
	}

	drumPadBank.channelScrollPosition().addValueObserver(function (on) {
		if (pagesShown) {
			showPagesLEDs();
		}
	});

	remoteControlsPage.selectedPageIndex().addValueObserver(function (on) {
		if (pagesShown) {
			showPagesLEDs();
		}
	});

	host.getMidiInPort(0).setMidiCallback(function (status, cc, val) { onMidi(0, status, cc, val); });
	host.getMidiInPort(0).setSysexCallback(onSysex0);
	host.getMidiInPort(1).setMidiCallback(function (status, cc, val) { onMidi(1, status, cc, val); });
	host.getMidiInPort(1).setSysexCallback(onSysex1);

	// noteInput = host.getMidiInPort(0).createNoteInput("", "??????");
	noteInput = host.getMidiInPort(0).createNoteInput("", "80????", "90????");
	noteInput.setShouldConsumeEvents(false);

	initializeLEDs();
	updateIndications();

	// host.showPopupNotification("Launchkey Mini MK2 initialized!");
}

// Called when a short MIDI message is received on MIDI input port 0.
function onMidi(midi, status, data1, data2)
{
	var cc = data1;
	var val = data2;

	// host.showPopupNotification("MIDI " + midi + ": " + status + " " + cc + " " + val);
	// println("MIDI " + midi + ": " + status + " " + cc + " " + val);

	// prev track
	if (midi == 1 && status == STATUS.CONTROL && cc == CC.MIDI1.PREV_TRACK) {
		if (val == 0) {
			cursorTrack.selectPrevious();
		}
		return;
	}

	// next track
	if (midi == 1 && status == STATUS.CONTROL && cc == CC.MIDI1.NEXT_TRACK) {
		if (val == 0) {
			cursorTrack.selectNext();
		}
		return;
	}

	// prev scene
	if (midi == 1 && status == STATUS.CONTROL && cc == CC.MIDI1.PREV_SCENE) {
		if (val == 0) {
			trackBank.scrollScenesUp();
		}
		return;
	}

	// next scene
	if (midi == 1 && status == STATUS.CONTROL && cc == CC.MIDI1.NEXT_SCENE) {
		if (val == 0) {
			trackBank.scrollScenesDown();
		}
		return;
	}

	// pad on
	if (midi == 0 && status == STATUS.MIDI0.PAD_ON && withinRange(cc, CC.MIDI0.PAD1, CC.MIDI0.PAD16)) {
		padIndex = cc - CC.MIDI0.PAD1;
		noteInput.sendRawMidiEvent(STATUS.MIDI0.NOTE_ON, drumPadBank.channelScrollPosition().get() + padIndex, val);
		return;
	}

	// pad off
	if (midi == 0 && status == STATUS.MIDI0.PAD_OFF && withinRange(cc, CC.MIDI0.PAD1, CC.MIDI0.PAD16)) {
		padIndex = cc - CC.MIDI0.PAD1;
		noteInput.sendRawMidiEvent(STATUS.MIDI0.NOTE_OFF, drumPadBank.channelScrollPosition().get() + padIndex, val);
		return;
	}

	// upper line pad on (in-control)
	if (midi == 1 && status == STATUS.MIDI1.PAD_ON && withinRange(cc, CC.MIDI1.PAD1, CC.MIDI1.PAD8)) {
		if (startPressed) {
			showPagesLEDs();
			drumPadBank.scrollToChannel((cc - CC.MIDI1.PAD1) * 16 + 4);
		}
		else {
			trackBank.getChannel(cc - CC.MIDI1.PAD1).clipLauncherSlotBank().launch(0);
		}
		return;
	}

	// lower line pad on (in-control)
	if (midi == 1 && status == STATUS.MIDI1.PAD_ON && withinRange(cc, CC.MIDI1.PAD9, CC.MIDI1.PAD16)) {
		if (startPressed) {
			showPagesLEDs();
			remoteControlsPage.selectedPageIndex().set(cc - CC.MIDI1.PAD9);
		}
		else {
			trackBank.getChannel(cc - CC.MIDI1.PAD9).clipLauncherSlotBank().stop();
		}
		return;
	}

	// upper line pad off (in-control)
	if (midi == 1 && status == STATUS.MIDI1.PAD_OFF && withinRange(cc, CC.MIDI1.PAD1, CC.MIDI1.PAD8)) {
		// TODO
		return;
	}

	// lower line pad off (in-control)
	if (midi == 1 && status == STATUS.MIDI1.PAD_OFF && withinRange(cc, CC.MIDI1.PAD9, CC.MIDI1.PAD16)) {
		// TODO
		return;
	}

	// upper start on (in-control)
	if (midi == 1 && status == STATUS.MIDI1.START_ON && cc == CC.MIDI1.PLAY) {
		startPressed = true;
		host.scheduleTask(showPagesLEDs, PAGES_SHOW_DELAY);
		return;
	}

	// lower start on (in-control)
	if (midi == 1 && status == STATUS.MIDI1.START_ON && cc == CC.MIDI1.STOP) {
		return;
	}

	// upper start off (in-control)
	if (midi == 1 && status == STATUS.MIDI1.START_OFF && cc == CC.MIDI1.PLAY) {
		startPressed = false;
		if (pagesShown) {
			pagesShown = false;
			showChannelLEDs();
			showStartLEDs();
		}
		else {
			trackBank.getClipLauncherScenes().launch(0);
		}
		return;
	}

	// lower start off (in-control)
	if (midi == 1 && status == STATUS.MIDI1.START_OFF && cc == CC.MIDI1.STOP) {
		trackBank.getClipLauncherScenes().stop();
		return;
	}

	// upper start on/off
	if (midi == 0 && status == STATUS.CONTROL && cc == CC.MIDI0.PLAY) {
		if (val == 0) {
			transport.play();
		}
		return;
	}

	// lower start on/off
	if (midi == 0 && status == STATUS.CONTROL && cc == CC.MIDI0.STOP) {
		if (val == 0) {
			transport.stop();
		}
		return;
	}

	// knobs (in-control)
	if (midi == 1 && status == STATUS.CONTROL && withinRange(cc, CC.KNOB1, CC.KNOB8)) {
		parameter = remoteControlsPage.getParameter(cc - CC.KNOB1);
		if (val == 63 || val == 64) {
			// set good middle value
			parameter.set(1, 3);
		}
		else {
			parameter.set(val, 128);
		}
		return;
	}
}

function showChannelLEDs()
{
	for (var p = 0; p < 8; ++p) {
		updateChannelLEDs(p);
	}
}

function updateChannelLEDs(idx)
{
	let channel = trackBank.getChannel(idx);
	let slot = channel.clipLauncherSlotBank().getItemAt(0);

	color = 0;
	if (slot.isPlaying().get() || slot.isPlaybackQueued().get()) {
		color = mkGreen(3);
	}
	else if (slot.isRecording().get() || slot.isRecordingQueued().get()) {
		color = mkRed(3);
	}
	else {
		color = slot.hasContent().get() ? mkRed(3) : 0;
	}
	setLED(CC.MIDI1.PAD1 + idx, color);
	setLED(CC.MIDI1.PAD9 + idx, (channel.isStopped().get() || !channel.exists().get()) ? 0 : mkRed(3));
}

function showPagesLEDs()
{
	if (!startPressed) {
		return;
	}
	pagesShown = true;
	clearLEDs(false);
	setLED(CC.MIDI1.PAD1 + parseInt(drumPadBank.channelScrollPosition().get() / 16), mkYellow(3));
	setLED(CC.MIDI1.PAD9 + remoteControlsPage.selectedPageIndex().get(), mkYellow(3));
}

function initializeLEDs()
{
	clearLEDs(true);

	for (var p = CC.MIDI1.PAD1; p <= CC.MIDI1.PAD8; ++p) {
		setLED(p, 0);
	}
	for (var p = CC.MIDI1.PAD9; p <= CC.MIDI1.PAD16; ++p) {
		setLED(p, 0);
	}
	showStartLEDs();
}

function showStartLEDs()
{
	playing = transport.isPlaying().get();
	setLED(CC.MIDI1.PLAY, playing ? mkRed(3) : 0);
	setLED(CC.MIDI1.STOP, playing ? 0 : mkRed(3));
}

function updateIndications()
{
	// TODO
}

// Called when a MIDI sysex message is received on MIDI input port 0.
function onSysex0(data)
{
}

// Called when a MIDI sysex message is received on MIDI input port 1.
function onSysex1(data)
{
}

function flush()
{
	flushLEDs();
}

function exit()
{
}
