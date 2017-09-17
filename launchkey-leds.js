load("launchkey-vars.js");

var ledState = initArray(0, 128);
var pendingLedState = initArray(0, 128);

function mkColor(green, red)
{
	return 0x10 * green + 0x01 * red;
}

function mkRed(value)
{
	return mkColor(0, value);
}

function mkGreen(value)
{
	return mkColor(value, 0);
}

function mkYellow(value)
{
	return mkColor(value, value);
}

function clearLEDs(force)
{
	for (var cc = 0; cc < ledState.length; ++cc) {
		if (force) {
			ledState[cc] = 1;
		}
		pendingLedState[cc] = 0;
	}
}

function setLED(cc, value)
{
	pendingLedState[cc] = value;
}

function updateLED(cc)
{
	if (ledState[cc] != pendingLedState[cc]) {
		host.getMidiOutPort(1).sendMidi(
			pendingLedState[cc] ? STATUS.MIDI1.PAD_ON : STATUS.MIDI1.PAD_OFF,
			cc,
			pendingLedState[cc]
		);
		ledState[cc] = pendingLedState[cc];
	}
}

function getLED(cc)
{
	return ledState[cc];
}

function getPendingLED(cc)
{
	return pendingLedState[cc];
}

function flushLEDs()
{
	for (var cc = 0; cc < ledState.length; ++cc) {
		updateLED(cc);
	}
}
