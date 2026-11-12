import config from './config.js';
import { addAlert, addDetectedAnimal, updateGateStatus } from './db_controller.js';
import { broadcastAlertData, broadcastGateUpdate } from './websocket_events.js';

// ------------------------------------------------------------------
// Saves what the Jetson reports (JETSON_LIVE_SERVICE=http_server) for the
// dashboard, stats and alerts pages: animal sightings and gate movements.
// ------------------------------------------------------------------

// The bird classes of the Jetson's model (models/classes/marsupial_16s.txt); the rest are mammals
const BIRDS = new Set(['Superb Lyrebird', 'Australian Brush-turkey', 'White-winged Chough']);

// A sighting is one visit by one animal: { name, confidence, action: 'OPEN' | 'CLOSE' | null }.
// Threats are the animals the gate rules close the gate for. The model doesn't say which
// animals are endangered, so none are recorded as endangered.
export async function saveSighting(io, sighting) {
    const isThreat = sighting.action === 'CLOSE';
    await addDetectedAnimal({
        animalType: BIRDS.has(sighting.name) ? 'Bird' : 'Mammal',
        animalName: sighting.name,
        isEndangered: false,
        isThreat,
    });
    if (isThreat) {
        await addAlert(`${sighting.name} detected at Gate #${config.jetsonGateNo} (${sighting.confidence}% confidence)`, 'warning');
        await broadcastAlertData(io);
    }
}

// The gate reached Open or Closed (from the Hall sensors). The first reading after the website
// starts only brings the database up to date, without an alert.
export async function saveGatePosition(io, position, { firstReading }) {
    const { gate, changed } = await updateGateStatus(config.jetsonGateNo, position);
    if (!changed) return;
    broadcastGateUpdate(io, gate);
    if (!firstReading) {
        await addAlert(`Gate #${config.jetsonGateNo} ${position === 'Open' ? 'Opened' : 'Closed'}`, 'info');
        await broadcastAlertData(io);
    }
}
