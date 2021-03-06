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

var clipHasContents = initArray(false, 8); // exists or not
var clipStates = initArray(0, 8); // 0 - stopped, 1 - playing, 2 - recording
var clipQueued = initArray(false, 8);
var channelStopped = initArray(true, 8);
var blink = false;

var greeting = false;

let PAGES_SHOW_DELAY = 200;
let GREETING_INTERVAL = 50;
let BLINK_INTERVAL = 200;

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

	drumPadBank.channelScrollPosition().addValueObserver(function (on) {
		bank = 0;
		shifted = false;
		if (on == 112) {
			bank = 7;
		}
		else {
			bank = parseInt((on - 4) / 16);
			if ((on - 4) % 16) {
				shifted = true;
			}
		}
		if (shifted) {
			drumPadBank.scrollToChannel(bank * 16 + 4);
		}
	});
	remoteControlsPage.selectedPageIndex().markInterested();

	transport.isPlaying().markInterested();
	// transport.isPlaying().addValueObserver(function(on) {
	// 	setLED(CC.MIDI1.PLAY, on ? mkRed(3) : 0);
	// 	setLED(CC.MIDI1.STOP, on ? 0 : mkRed(3));
	// });

	trackBank.channelCount().markInterested();
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
			clipStates[idx] = state;
			clipQueued[idx] = queued;
		});
		trackBank.getChannel(p).clipLauncherSlotBank().addHasContentObserver(function(slotIndex, has) {
			clipHasContents[idx] = has;
		});
		trackBank.getChannel(p).isStopped().addValueObserver(function(stopped) {
			channelStopped[idx] = stopped;
		});
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

	updateIndications();
	clearLEDs(true);
	flushLEDs();
	inControlMode(true);
	showGreeting();
	// initializeLEDs();

	blinkTimer();

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
			remoteControlsPage.selectedPageIndex().set(cc - CC.MIDI1.PAD1);
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
			drumPadBank.scrollToChannel((cc - CC.MIDI1.PAD9) * 16 + 4);
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

function inControlMode(on)
{
	host.getMidiOutPort(1).sendMidi(STATUS.MIDI1.IN_CONTROL, CC.MIDI1.IN_CONTROL, on ? 127 : 0);
}

function blinkTimer()
{
	blink = !blink;
	host.scheduleTask(blinkTimer, BLINK_INTERVAL);
}

function showGreeting()
{
	greeting = true;
	clearLEDs(true);
	function drawGreeting(values)
	{
		let value = values.pop();
		let brightness = value ? value : 0;

		let noColor = function (value) { return 0; };
		let picUpper = [noColor, mkGreen, mkYellow, mkRed, mkRed, mkYellow, mkGreen, noColor];
		let picLower = [mkGreen, mkYellow, mkRed, mkYellow, mkYellow, mkRed, mkYellow, mkGreen];

		picUpper.forEach(function (upper, index) {
			setLED(CC.MIDI1.PAD1 + index, upper(brightness));
		});

		picLower.forEach(function (lower, index) {
			setLED(CC.MIDI1.PAD9 + index, lower(brightness));
		});

		// flushLEDs();

		if (values.length > 0) {
			host.scheduleTask(function () { drawGreeting(values); }, GREETING_INTERVAL);
		}
		else {
			greeting = false;
			initializeLEDs();
		}
	}

	drawGreeting([0,1,1,2,2,2,3,3,3,3,3,2,2,2,1,1]);
}

function showChannelLEDs()
{
	for (var p = 0; p < 8; ++p) {
		updateChannelLEDs(p);
	}
}

function updateChannelLEDs(idx)
{
	upper = 0;
	lower = 0;

	stopped = (idx >= trackBank.channelCount().get()) || channelStopped[idx];

	switch (clipStates[idx]) {
		case 0: // stopped
			if (clipHasContents[idx]) {
				upper = mkRed(3);
			}
			lower = stopped ? 0 : mkRed(3);
			break;
		case 1: // playing
			if (clipHasContents[idx]) {
				upper = mkGreen(3);
			}
			lower = stopped ? 0 : mkRed(3);
			break;
		case 2: // recording
			upper = mkRed(3);
			lower = mkRed(3);
			break;
	}

	if (transport.isPlaying().get() && clipQueued[idx] && !blink) {
		upper = 0;
	}

	setLED(CC.MIDI1.PAD1 + idx, upper);
	setLED(CC.MIDI1.PAD9 + idx, lower);
}

function showPagesLEDs()
{
	if (!startPressed) {
		return;
	}
	pagesShown = true;
	clearLEDs(false);
	setLED(CC.MIDI1.PAD1 + remoteControlsPage.selectedPageIndex().get(), mkYellow(3));
	setLED(CC.MIDI1.PAD9 + parseInt(drumPadBank.channelScrollPosition().get() / 16), mkYellow(3));
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
	showChannelLEDs();
	showStartLEDs();
	flushLEDs();
}

function showStartLEDs()
{
	setLED(CC.MIDI1.PLAY, mkGreen(3));
	setLED(CC.MIDI1.STOP, mkRed(3));
	// playing = transport.isPlaying().get();
	// setLED(CC.MIDI1.PLAY, playing ? mkRed(3) : 0);
	// setLED(CC.MIDI1.STOP, playing ? 0 : mkRed(3));
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
	if (!greeting && !pagesShown) {
		showChannelLEDs();
	}
	flushLEDs();
}

function exit()
{
	inControlMode(false);
}
