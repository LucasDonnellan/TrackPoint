/**
 * FarmTrack GPS Tracker — ESP32 / LILYGO T-A7670 Firmware
 * ──────────────────────────────────────────────────────────
 * Reads GPS via UART, sends JSON to your FarmTrack API over LTE.
 * Uses TinyGSM for modem + HTTPClient for POST.
 *
 * Library dependencies (install via Arduino Library Manager):
 *   - TinyGSM  (vshymanskyy/TinyGSM)
 *   - ArduinoHttpClient
 *   - ArduinoJson
 */

#define TINY_GSM_MODEM_SIM7670      // T-A7670 uses SIM7670C chip
#include <TinyGsmClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

// ── Configuration — CHANGE THESE ─────────────────────────────────────────────
const char* APN          = "your.apn.here";           // SIM card APN
const char* API_HOST     = "yourdomain.com";           // Your server hostname
const int   API_PORT     = 443;
const char* API_PATH     = "/api/location";
const char* DEVICE_ID    = "tractor01";                // Must match DB device_id
const char* DEVICE_KEY   = "YOUR_64_CHAR_API_KEY";    // From /api/devices POST response
const int   SEND_INTERVAL_MS = 30000;                  // 30 seconds

// ── Pin definitions for T-A7670 ───────────────────────────────────────────────
#define MODEM_TX    27
#define MODEM_RX    26
#define MODEM_PWRKEY 4
#define GPS_TX      34
#define GPS_RX      33

HardwareSerial modemSerial(1);
HardwareSerial gpsSerial(2);
TinyGsm        modem(modemSerial);
TinyGsmClient  gsmClient(modem);
HttpClient     httpClient(gsmClient, API_HOST, API_PORT);

// ── Simple GPS parser (GPRMC sentence) ───────────────────────────────────────
struct GpsData { float lat, lng, speed, heading; bool valid; };

GpsData parseNMEA(const String& sentence) {
  GpsData gps = {0, 0, 0, 0, false};
  if (!sentence.startsWith("$GPRMC")) return gps;
  // Tokenise
  String parts[13]; int idx = 0;
  for (int i = 0, j; i < sentence.length() && idx < 13; i = j + 1, idx++) {
    j = sentence.indexOf(',', i);
    if (j == -1) j = sentence.length();
    parts[idx] = sentence.substring(i, j);
  }
  if (parts[2] != "A") return gps;   // not valid fix
  // Lat: ddmm.mmmmm
  float rawLat = parts[3].toFloat();
  gps.lat = (int)(rawLat / 100) + fmod(rawLat, 100) / 60.0;
  if (parts[4] == "S") gps.lat = -gps.lat;
  float rawLng = parts[5].toFloat();
  gps.lng = (int)(rawLng / 100) + fmod(rawLng, 100) / 60.0;
  if (parts[6] == "W") gps.lng = -gps.lng;
  gps.speed   = parts[7].toFloat() * 1.852;  // knots → km/h
  gps.heading = parts[8].toFloat();
  gps.valid   = true;
  return gps;
}

// ── ADC battery voltage ───────────────────────────────────────────────────────
float readBattery() {
  // T-A7670 battery divider on ADC pin 35 (1:2 divider, 3.3V ref)
  int raw = analogRead(35);
  return (raw / 4095.0) * 3.3 * 2.0;
}

// ── Modem boot ────────────────────────────────────────────────────────────────
void bootModem() {
  pinMode(MODEM_PWRKEY, OUTPUT);
  digitalWrite(MODEM_PWRKEY, LOW);
  delay(1000);
  digitalWrite(MODEM_PWRKEY, HIGH);
  delay(2000);
  modemSerial.begin(115200, SERIAL_8N1, MODEM_RX, MODEM_TX);
  modem.restart();
  Serial.println("[modem] Connecting to " + String(APN));
  modem.gprsConnect(APN);
  Serial.println("[modem] Connected: " + String(modem.isGprsConnected() ? "yes" : "no"));
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  bootModem();
  Serial.println("[farmtrack] Ready.");
}

// ── Loop ──────────────────────────────────────────────────────────────────────
unsigned long lastSend = 0;
String gpsBuffer = "";

void loop() {
  // Buffer GPS NMEA sentences
  while (gpsSerial.available()) {
    char c = gpsSerial.read();
    gpsBuffer += c;
    if (c == '\n') {
      GpsData gps = parseNMEA(gpsBuffer);
      if (gps.valid && millis() - lastSend >= SEND_INTERVAL_MS) {
        sendLocation(gps);
        lastSend = millis();
      }
      gpsBuffer = "";
    }
  }

  // Reconnect modem if dropped
  if (!modem.isGprsConnected()) {
    Serial.println("[modem] Reconnecting…");
    modem.gprsConnect(APN);
  }
}

// ── HTTP POST to FarmTrack API ────────────────────────────────────────────────
void sendLocation(GpsData& gps) {
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["latitude"]  = gps.lat;
  doc["longitude"] = gps.lng;
  doc["speed"]     = gps.speed;
  doc["heading"]   = (int)gps.heading;
  doc["battery"]   = readBattery();
  // ISO 8601 timestamp — ideally sync RTC from GPS; placeholder here
  doc["timestamp"] = "2026-01-01T00:00:00Z";

  String body;
  serializeJson(doc, body);

  httpClient.beginRequest();
  httpClient.post(API_PATH);
  httpClient.sendHeader("Content-Type", "application/json");
  httpClient.sendHeader("X-Device-Key", DEVICE_KEY);
  httpClient.sendHeader("Content-Length", body.length());
  httpClient.beginBody();
  httpClient.print(body);
  httpClient.endRequest();

  int status = httpClient.responseStatusCode();
  Serial.printf("[api] POST %s → %d\n", API_PATH, status);
}
