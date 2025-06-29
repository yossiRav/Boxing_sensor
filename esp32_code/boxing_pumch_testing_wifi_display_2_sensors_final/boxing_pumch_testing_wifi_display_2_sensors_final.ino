/*
 * חיישן אגרוף - שני חיישנים יציבים
 25/06/2025
 תוכנית שעבדת טוב עם שני חיישנים
 * ESP32 + 2x MPU6050 + WiFi
 * 
 * מיקום חיישנים על השק:
 * חיישן 1: עליון (ראש/גוף) - SDA=21, SCL=22, כתובת=0x68
 * חיישן 2: תחתון (כבד) - SDA=25, SCL=26, כתובת=0x68
 */

#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>

// הגדרות Access Point
const char* ap_ssid = "BoxingSensor";
const char* ap_password = "12345678";

// פיני I2C לשני חיישנים (יציב ומוכח)
#define SDA1 21  // חיישן עליון
#define SCL1 22
#define SDA2 25  // חיישן תחתון
#define SCL2 26

// כתובות חיישנים - שניהם באותה כתובת אבל על I2C נפרד
#define MPU6050_ADDR1 0x68  // חיישן עליון (AD0=GND או לא מחובר)
#define MPU6050_ADDR2 0x68  // חיישן תחתון (AD0=GND או לא מחובר)

// שני I2C buses (hardware - יציב)
TwoWire I2C_1 = TwoWire(0);
TwoWire I2C_2 = TwoWire(1);

// אובייקט שרת
WebServer server(80);

// מבנה נתונים לכל חיישן
struct SensorData {
    float current_punch;
    float max_punch;
    int punch_count;
    float baseline_x, baseline_y, baseline_z;
    bool punch_detected;
    unsigned long last_detection;
    unsigned long last_punch_time;
    
    // קליברציה דינמית
    float moving_avg_x, moving_avg_y, moving_avg_z;
    float noise_level;
    int stable_count;
    unsigned long last_recalibration;
    
    // היסטוריה (לגרף)
    float history[20];
    int history_index;
};

SensorData sensor1; // עליון (ראש/גוף)
SensorData sensor2; // תחתון (כבד)

unsigned long training_start_time = 0;
int total_punches = 0;

// הגדרות מעקב אגרופים - מותאמות למתאגרפים מקצועיים
float PUNCH_THRESHOLD = 0.8;
const unsigned long COOLDOWN_BETWEEN_PUNCHES = 120;  // 120ms = 8.3 מכות/שנייה (מתאים למהירות גבוהה)
const unsigned long SENSOR_RESET_TIME = 50;         // 50ms = זמן מינימלי לזיהוי מכה חדשה
const unsigned long VIBRATION_SETTLE_TIME = 80;     // 80ms = זמן קצר להרגעת ויברציות מיידיות

// למידה אוטומטית
const int LEARNING_SAMPLE_SIZE = 15;
float learning_forces[LEARNING_SAMPLE_SIZE];
unsigned long learning_intervals[LEARNING_SAMPLE_SIZE];
int learning_index = 0;
bool learning_complete = false;

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("=== חיישן אגרוף 2 אזורים יציב ===");
    
    // איפוס משתנים
    resetSensorData(&sensor1);
    resetSensorData(&sensor2);
    total_punches = 0;
    training_start_time = millis();
    
    // אתחול שני I2C buses (hardware בלבד - יציב)
    Serial.println("מאתחל I2C buses...");
    I2C_1.begin(SDA1, SCL1, 100000); // 100kHz ליציבות
    I2C_2.begin(SDA2, SCL2, 100000);
    
    Serial.printf("I2C_1: SDA=%d, SCL=%d (כתובת 0x%02X)\n", SDA1, SCL1, MPU6050_ADDR1);
    Serial.printf("I2C_2: SDA=%d, SCL=%d (כתובת 0x%02X)\n", SDA2, SCL2, MPU6050_ADDR2);
    
    delay(100);
    
    // אתחול שני MPU6050
    Serial.println("\nמאתחל חיישנים...");
    initMPU6050(&I2C_1, "עליון (ראש/גוף)", MPU6050_ADDR1);
    initMPU6050(&I2C_2, "תחתון (כבד)", MPU6050_ADDR2);
    
    delay(500);
    
    // קליברציה של שני חיישנים
    Serial.println("\nמכייל חיישנים...");
    calibrateSensor(&I2C_1, &sensor1, "עליון", MPU6050_ADDR1);
    calibrateSensor(&I2C_2, &sensor2, "תחתון", MPU6050_ADDR2);
    
    // יצירת Access Point
    createAccessPoint();
    
    // הגדרת שרת רשת
    setupWebServer();
    
    // הכל מוכן!
    Serial.println("🥊 מערכת 2 חיישנים מוכנה ויציבה!");
    Serial.print("📱 כתובת לטלפון: http://");
    Serial.println(WiFi.softAPIP());
    Serial.println("🔗 התחבר לרשת BoxingSensor עם סיסמה: 12345678");
    Serial.println("אתחל אימון!");
}

void loop() {
    server.handleClient();
    
    // קריאת נתוני שני חיישנים
    readSensor(&I2C_1, &sensor1, MPU6050_ADDR1);
    readSensor(&I2C_2, &sensor2, MPU6050_ADDR2);
    
    // זיהוי מכות בכל חיישן
    detectPunch(&sensor1);
    detectPunch(&sensor2);
    
    // זיהוי מכה חכם - רק החיישן החזק ביותר זוכה
    detectSmartPunch();
    
    // עדכון סיכום כללי
    total_punches = sensor1.punch_count + sensor2.punch_count;
    
    // הדפסת מצב בSerial כל 3 שניות
    static unsigned long last_status = 0;
    if (millis() - last_status > 3000) {
        printStatus();
        last_status = millis();
    }
    
    delay(10); // דגימה מהירה - 100Hz
}

void resetSensorData(SensorData* sensor) {
    sensor->current_punch = 0.0;
    sensor->max_punch = 0.0;
    sensor->punch_count = 0;
    sensor->baseline_x = 0.0;
    sensor->baseline_y = 0.0;
    sensor->baseline_z = 0.0;
    sensor->punch_detected = false;
    sensor->last_detection = 0;
    sensor->last_punch_time = 0;
    sensor->history_index = 0;
    
    // קליברציה דינמית
    sensor->moving_avg_x = 0.0;
    sensor->moving_avg_y = 0.0;
    sensor->moving_avg_z = 0.0;
    sensor->noise_level = 0.1;
    sensor->stable_count = 0;
    sensor->last_recalibration = 0;
    
    // איפוס היסטוריה
    for (int i = 0; i < 20; i++) {
        sensor->history[i] = 0.0;
    }
}

void initMPU6050(TwoWire* wire, const char* name, byte addr) {
    Serial.print("מאתחל ");
    Serial.print(name);
    Serial.print(" (0x");
    Serial.print(addr, HEX);
    Serial.print(")...");
    
    // בדיקת חיבור
    wire->beginTransmission(addr);
    byte error = wire->endTransmission();
    
    if (error == 0) {
        Serial.println(" זוהה!");
        
        // אתחול החיישן
        wire->beginTransmission(addr);
        wire->write(0x6B);  // PWR_MGMT_1 register
        wire->write(0);     // wake up the sensor
        wire->endTransmission(true);
        delay(100);
        
        // בדיקת WHO_AM_I
        wire->beginTransmission(addr);
        wire->write(0x75);  // WHO_AM_I register
        wire->endTransmission(false);
        wire->requestFrom(addr, 1, true);
        
        if (wire->available()) {
            byte whoami = wire->read();
            Serial.print("✓ ");
            Serial.print(name);
            Serial.print(" מחובר בהצלחה (ID: 0x");
            Serial.print(whoami, HEX);
            Serial.println(")");
        }
    } else {
        Serial.print(" ❌ שגיאה ");
        Serial.print(error);
        Serial.println();
    }
}

void readSensor(TwoWire* wire, SensorData* sensor, byte addr) {
    wire->beginTransmission(addr);
    wire->write(0x3B);
    byte error = wire->endTransmission(false);
    
    if (error != 0) {
        sensor->current_punch = 0.0;
        return;
    }
    
    wire->requestFrom(addr, 6, true);
    
    if (wire->available() >= 6) {
        int16_t ax = (wire->read() << 8) | wire->read();
        int16_t ay = (wire->read() << 8) | wire->read();
        int16_t az = (wire->read() << 8) | wire->read();
        
        float ax_g = ax / 16384.0;
        float ay_g = ay / 16384.0;
        float az_g = az / 16384.0;
        
        // עדכון ממוצע נע רק כשהחיישן רגוע
        updateMovingBaseline(sensor, ax_g, ay_g, az_g);
        
        // חישוב ההפרש מהממוצע הנע
        float diff_x = ax_g - sensor->moving_avg_x;
        float diff_y = ay_g - sensor->moving_avg_y;
        float diff_z = az_g - sensor->moving_avg_z;
        
        float magnitude = sqrt(diff_x*diff_x + diff_y*diff_y + diff_z*diff_z);
        
        // רק תנועות חזקות מעל הרף נחשבות כמכות
        if (magnitude > PUNCH_THRESHOLD) {
            sensor->current_punch = magnitude;
        } else {
            sensor->current_punch = 0.0; // מתחת לרף = אפס
        }
        
        // עדכון מקסימום
        if (sensor->current_punch > sensor->max_punch) {
            sensor->max_punch = sensor->current_punch;
        }
        
        // עדכון היסטוריה לגרף
        sensor->history[sensor->history_index] = sensor->current_punch;
        sensor->history_index = (sensor->history_index + 1) % 20;
    } else {
        sensor->current_punch = 0.0;
    }
}

// פונקציה משופרת: עדכון ממוצע נע רק כשרגוע
void updateMovingBaseline(SensorData* sensor, float ax, float ay, float az) {
    // חישוב ההפרש מהממוצע הנוכחי
    float diff_from_baseline = sqrt(
        pow(ax - sensor->moving_avg_x, 2) +
        pow(ay - sensor->moving_avg_y, 2) +
        pow(az - sensor->moving_avg_z, 2)
    );
    
    // אם הערכים יציבים וקרובים לממוצע - עדכן את הבסיס
    if (diff_from_baseline < 0.15) { // רף יציבות קטן יותר
        // עדכון איטי מאוד של הבסיס (רק כשרגוע)
        const float alpha = 0.005; // עדכון איטי מאוד
        
        sensor->moving_avg_x = sensor->moving_avg_x * (1 - alpha) + ax * alpha;
        sensor->moving_avg_y = sensor->moving_avg_y * (1 - alpha) + ay * alpha;
        sensor->moving_avg_z = sensor->moving_avg_z * (1 - alpha) + az * alpha;
        
        sensor->stable_count++;
        
        // קליברציה מחדש אחרי זמן רב של יציבות
        if (sensor->stable_count > 500) { // 5 שניות של יציבות
            sensor->baseline_x = sensor->moving_avg_x;
            sensor->baseline_y = sensor->moving_avg_y;
            sensor->baseline_z = sensor->moving_avg_z;
            sensor->stable_count = 0;
            
            Serial.println("🔧 קליברציה אוטומטית - החיישן התייצב");
        }
    } else {
        // אם יש תנועה - איפוס מונה היציבות
        sensor->stable_count = 0;
    }
}

void detectPunch(SensorData* sensor) {
    unsigned long current_time = millis();
    
    // רף פשוט וקבוע - רק מכות חזקות נספרות
    if (sensor->current_punch > PUNCH_THRESHOLD && 
        !sensor->punch_detected && 
        (current_time - sensor->last_detection > SENSOR_RESET_TIME)) {
        
        sensor->punch_detected = true;
        sensor->last_detection = current_time;
    }
    
    // איפוס זיהוי מכה כשהעוצמה יורדת
    if (sensor->current_punch < PUNCH_THRESHOLD * 0.3) {
        sensor->punch_detected = false;
    }
}

void detectSmartPunch() {
    static unsigned long last_smart_detection = 0;
    unsigned long current_time = millis();
    
    // בדיקה שיש זיהוי בלפחות חיישן אחד
    bool any_punch = sensor1.punch_detected || sensor2.punch_detected;
    
    if (any_punch && (current_time - last_smart_detection > COOLDOWN_BETWEEN_PUNCHES)) {
        // איזה חיישן מרגיש הכי חזק?
        float max_force = 0;
        int winning_sensor = 0;
        String winning_zone = "";
        
        if (sensor1.current_punch > max_force && sensor1.current_punch > PUNCH_THRESHOLD) {
            max_force = sensor1.current_punch;
            winning_sensor = 1;
            winning_zone = "עליון";
        }
        
        if (sensor2.current_punch > max_force && sensor2.current_punch > PUNCH_THRESHOLD) {
            max_force = sensor2.current_punch;
            winning_sensor = 2;
            winning_zone = "תחתון";
        }
        
        // אם יש זוכה אמיתי (מעל הרף)
        if (winning_sensor > 0) {
            // בדיקה נוספת: האם זו מכה אמיתית או ויברציה?
            if (isRealPunch(winning_sensor, current_time)) {
                // רק החיישן הזוכה מקבל נקודה
                if (winning_sensor == 1) {
                    sensor1.punch_count++;
                    sensor1.last_punch_time = current_time;
                } else {
                    sensor2.punch_count++;
                    sensor2.last_punch_time = current_time;
                }
                
                // חישוב עוצמה מדויקת יותר עם שני החיישנים
                float combined_force = calculateCombinedForce(winning_sensor);
                
                // חישוב BPM (מכות לדקה)
                static unsigned long last_punch_time_for_bpm = 0;
                unsigned long time_between_punches = current_time - last_punch_time_for_bpm;
                float bpm = 0;
                if (last_punch_time_for_bpm > 0 && time_between_punches > 0) {
                    bpm = 60000.0 / time_between_punches;
                }
                
                // למידה אוטומטית
                if (!learning_complete) {
                    adaptToUser(combined_force, time_between_punches);
                }
                
                last_punch_time_for_bpm = current_time;
                
                Serial.print("🥊 מכה ");
                Serial.print(winning_zone);
                Serial.print(" #");
                Serial.print((winning_sensor == 1 ? sensor1.punch_count : sensor2.punch_count));
                Serial.print(" עוצמה: ");
                Serial.print(max_force, 2);
                Serial.print(" (משולב: ");
                Serial.print(combined_force, 2);
                Serial.print(")");
                
                if (bpm > 0 && bpm < 300) {
                    Serial.print(" BPM: ");
                    Serial.print(bpm, 0);
                }
                
                if (!learning_complete) {
                    Serial.print(" [למידה ");
                    Serial.print(learning_index);
                    Serial.print("/");
                    Serial.print(LEARNING_SAMPLE_SIZE);
                    Serial.print("]");
                }
                
                Serial.print(" | עליון:");
                Serial.print(sensor1.current_punch, 1);
                Serial.print(" תחתון:");
                Serial.print(sensor2.current_punch, 1);
                Serial.print(" | סה''כ: ");
                Serial.println(sensor1.punch_count + sensor2.punch_count);
                
                last_smart_detection = current_time;
            } else {
                Serial.println("⚠️ ויברציה/רעש נדחה (מהירות גבוהה מדי)");
            }
        }
    }
}

// פונקציה חדשה: בדיקה האם זו מכה אמיתית או ויברציה - מותאמת למהירות גבוהה
bool isRealPunch(int sensor_num, unsigned long current_time) {
    SensorData* sensor = (sensor_num == 1) ? &sensor1 : &sensor2;
    
    // בדיקה 1: האם עברו מספיק זמן מהמכה הקודמת? (מותאם למהירות גבוהה)
    if (current_time - sensor->last_punch_time < VIBRATION_SETTLE_TIME) {
        return false; // יותר מדי מהר אפילו למתאגרף מקצועי
    }
    
    // בדיקה 2: האם העוצמה חזקה מספיק? (רף נמוך יותר למכות מהירות)
    if (sensor->current_punch < PUNCH_THRESHOLD * 0.9) { // 90% מהרף (במקום 120%)
        return false; // מכות מהירות יכולות להיות קצת חלשות יותר
    }
    
    // בדיקה 3: בדיקת עלייה חדה - מותאמת למהירות
    static float last_magnitude[2] = {0, 0};
    static unsigned long last_update_time[2] = {0, 0};
    int sensor_index = sensor_num - 1;
    
    float magnitude_jump = sensor->current_punch - last_magnitude[sensor_index];
    unsigned long time_since_last = current_time - last_update_time[sensor_index];
    
    // עדכון ערכים
    last_magnitude[sensor_index] = sensor->current_punch;
    last_update_time[sensor_index] = current_time;
    
    // בדיקת מהירות עלייה (לזהות מכות חדות וחטופות)
    if (time_since_last > 0) {
        float velocity = magnitude_jump / time_since_last; // עוצמה/זמן
        
        if (velocity > 0.005) { // רף מהירות עלייה (מכה חדה)
            return true; // עלייה חדה = מכה אמיתית
        }
    }
    
    // אם העוצמה גבוהה מספיק, זו כנראה מכה
    if (sensor->current_punch > PUNCH_THRESHOLD * 1.5) {
        return true; // מכה חזקה = בטוח מכה אמיתית
    }
    
    return false; // לא עמדה בקריטריונים = ויברציה
}

float calculateCombinedForce(int primary_sensor) {
    float primary_force = 0;
    float secondary_boost = 0;
    
    if (primary_sensor == 1) {
        primary_force = sensor1.current_punch;
        secondary_boost = sensor2.current_punch * 0.2; // 20% השפעה
    } else {
        primary_force = sensor2.current_punch;
        secondary_boost = sensor1.current_punch * 0.2;
    }
    
    return primary_force + secondary_boost;
}

void adaptToUser(float force, unsigned long interval) {
    if (learning_index < LEARNING_SAMPLE_SIZE) {
        learning_forces[learning_index] = force;
        learning_intervals[learning_index] = interval;
        learning_index++;
        
        if (learning_index >= LEARNING_SAMPLE_SIZE) {
            // חישוב ממוצעים ועדכון הגדרות
            float avg_force = 0;
            for (int i = 0; i < LEARNING_SAMPLE_SIZE; i++) {
                avg_force += learning_forces[i];
            }
            avg_force /= LEARNING_SAMPLE_SIZE;
            
            // התאמת רף זיהוי
            PUNCH_THRESHOLD = avg_force * 0.7;
            if (PUNCH_THRESHOLD < 0.3) PUNCH_THRESHOLD = 0.3;
            if (PUNCH_THRESHOLD > 1.5) PUNCH_THRESHOLD = 1.5;
            
            learning_complete = true;
            
            Serial.println("\n✅ למידה הושלמה!");
            Serial.printf("רף זיהוי חדש: %.2f\n", PUNCH_THRESHOLD);
            Serial.printf("על בסיס ממוצע: %.2f\n", avg_force);
        }
    }
}

void calibrateSensor(TwoWire* wire, SensorData* sensor, const char* name, byte addr) {
    Serial.print("מכייל ");
    Serial.print(name);
    Serial.print("...");
    
    wire->beginTransmission(addr);
    byte error = wire->endTransmission();
    
    if (error != 0) {
        Serial.println(" ❌ החיישן לא מחובר");
        return;
    }
    
    float sum_x = 0, sum_y = 0, sum_z = 0;
    int samples = 100; // יותר דגימות לדיוק רב יותר
    int successful_reads = 0;
    
    for (int i = 0; i < samples; i++) {
        wire->beginTransmission(addr);
        wire->write(0x3B);
        wire->endTransmission(false);
        wire->requestFrom(addr, 6, true);
        
        if (wire->available() >= 6) {
            int16_t ax = (wire->read() << 8) | wire->read();
            int16_t ay = (wire->read() << 8) | wire->read();
            int16_t az = (wire->read() << 8) | wire->read();
            
            float ax_g = ax / 16384.0;
            float ay_g = ay / 16384.0;
            float az_g = az / 16384.0;
            
            sum_x += ax_g;
            sum_y += ay_g;
            sum_z += az_g;
            successful_reads++;
        }
        delay(10); // קצת יותר זמן בין דגימות
        
        if (i % 20 == 0) Serial.print(".");
    }
    
    if (successful_reads > 0) {
        // קליברציה בסיסית
        sensor->baseline_x = sum_x / successful_reads;
        sensor->baseline_y = sum_y / successful_reads;
        sensor->baseline_z = sum_z / successful_reads;
        
        // אתחול הממוצע הנע עם הקליברציה הבסיסית
        sensor->moving_avg_x = sensor->baseline_x;
        sensor->moving_avg_y = sensor->baseline_y;
        sensor->moving_avg_z = sensor->baseline_z;
        
        // חישוב רמת רעש ראשונית
        float noise_sum = 0;
        for (int i = 0; i < 50; i++) { // עוד 50 דגימות לחישוב רעש
            wire->beginTransmission(addr);
            wire->write(0x3B);
            wire->endTransmission(false);
            wire->requestFrom(addr, 6, true);
            
            if (wire->available() >= 6) {
                int16_t ax = (wire->read() << 8) | wire->read();
                int16_t ay = (wire->read() << 8) | wire->read();
                int16_t az = (wire->read() << 8) | wire->read();
                
                float ax_g = ax / 16384.0;
                float ay_g = ay / 16384.0;
                float az_g = az / 16384.0;
                
                float diff = sqrt(
                    pow(ax_g - sensor->baseline_x, 2) +
                    pow(ay_g - sensor->baseline_y, 2) +
                    pow(az_g - sensor->baseline_z, 2)
                );
                noise_sum += diff;
            }
            delay(10);
        }
        
        sensor->noise_level = (noise_sum / 50) + 0.05; // רמת רעש + מרווח ביטחון
        
        Serial.print(" ✓ מכויל (");
        Serial.print(sensor->baseline_x, 2);
        Serial.print(", ");
        Serial.print(sensor->baseline_y, 2);
        Serial.print(", ");
        Serial.print(sensor->baseline_z, 2);
        Serial.print(") רעש: ");
        Serial.println(sensor->noise_level, 3);
    } else {
        Serial.println(" ❌ כשל בקליברציה");
    }
}

void createAccessPoint() {
    Serial.println("יוצר Access Point...");
    WiFi.softAP(ap_ssid, ap_password);
    
    Serial.println("✓ Access Point נוצר!");
    Serial.print("שם רשת: ");
    Serial.println(ap_ssid);
    Serial.print("סיסמה: ");
    Serial.println(ap_password);
    Serial.print("כתובת IP: ");
    Serial.println(WiFi.softAPIP());
}

void setupWebServer() {
    server.on("/", handleRoot);
    server.on("/api/data", handleApiData);
    server.on("/api/reset", handleReset);
    // server.on("/api/calibrate", handleCalibrate); // זמנית מבוטל
    
    server.begin();
    Serial.println("🌐 שרת רשת מופעל על פורט 80");
}

void handleRoot() {
    String html = "<!DOCTYPE html>";
    html += "<html dir='rtl' lang='he'>";
    html += "<head>";
    html += "<meta charset='UTF-8'>";
    html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
    html += "<title>חיישן אגרוף 2 אזורים</title>";
    html += "<style>";
    html += "body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin: 0; padding: 10px; }";
    html += ".container { max-width: 420px; margin: 0 auto; }";
    html += ".header { text-align: center; margin-bottom: 20px; font-size: 22px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }";
    html += ".total { background: linear-gradient(145deg, rgba(255,255,255,0.25), rgba(255,255,255,0.1)); border-radius: 20px; padding: 20px; text-align: center; margin-bottom: 20px; backdrop-filter: blur(10px); box-shadow: 0 8px 32px rgba(0,0,0,0.1); }";
    html += ".total-value { font-size: 48px; font-weight: bold; color: #00FF88; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); margin: 10px 0; }";
    html += ".zone { background: linear-gradient(145deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05)); border-radius: 15px; padding: 15px; margin-bottom: 15px; backdrop-filter: blur(5px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }";
    html += ".zone-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; text-align: center; text-shadow: 1px 1px 2px rgba(0,0,0,0.3); }";
    html += ".stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }";
    html += ".stat { text-align: center; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 8px; }";
    html += ".stat-label { font-size: 11px; opacity: 0.8; margin-bottom: 4px; }";
    html += ".stat-value { font-size: 18px; font-weight: bold; color: #FFD700; }";
    html += ".percentage { background: linear-gradient(145deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05)); border-radius: 15px; padding: 15px; margin-bottom: 20px; }";
    html += ".percentage-title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 10px; }";
    html += ".percentage-bar { display: flex; height: 30px; border-radius: 15px; overflow: hidden; background: rgba(0,0,0,0.2); }";
    html += ".bar-segment { display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; transition: all 0.3s ease; }";
    html += ".bar-upper { background: linear-gradient(45deg, #FF6B6B, #FF8E8E); }";
    html += ".bar-lower { background: linear-gradient(45deg, #4ECDC4, #44A08D); }";
    html += ".btn { background: linear-gradient(45deg, #FF6B6B, #FF8E8E); border: none; border-radius: 12px; color: white; font-size: 14px; font-weight: bold; padding: 12px; cursor: pointer; width: 100%; margin-top: 10px; }";
    html += "</style>";
    html += "</head>";
    html += "<body>";
    
    html += "<div class='container'>";
    html += "<div class='header'>🥊 חיישן אגרוף 2 אזורים יציב</div>";
    
    html += "<div class='total'>";
    html += "<div>סה''כ מכות</div>";
    html += "<div class='total-value' id='totalPunches'>0</div>";
    html += "<div>זמן: <span id='trainingTime'>00:00</span></div>";
    html += "</div>";
    
    html += "<div class='percentage'>";
    html += "<div class='percentage-title'>התפלגות מכות</div>";
    html += "<div class='percentage-bar'>";
    html += "<div class='bar-segment bar-upper' id='upperPercent'>עליון</div>";
    html += "<div class='bar-segment bar-lower' id='lowerPercent'>תחתון</div>";
    html += "</div>";
    html += "</div>";
    
    // אזור עליון
    html += "<div class='zone'>";
    html += "<div class='zone-title'>🎯 עליון (ראש/גוף)</div>";
    html += "<div class='stats'>";
    html += "<div class='stat'><div class='stat-label'>נוכחי</div><div class='stat-value' id='current1'>0.0</div></div>";
    html += "<div class='stat'><div class='stat-label'>מקסימום</div><div class='stat-value' id='max1'>0.0</div></div>";
    html += "<div class='stat'><div class='stat-label'>מכות</div><div class='stat-value' id='count1'>0</div></div>";
    html += "</div>";
    html += "</div>";
    
    // אזור תחתון
    html += "<div class='zone'>";
    html += "<div class='zone-title'>💪 תחתון (כבד)</div>";
    html += "<div class='stats'>";
    html += "<div class='stat'><div class='stat-label'>נוכחי</div><div class='stat-value' id='current2'>0.0</div></div>";
    html += "<div class='stat'><div class='stat-label'>מקסימום</div><div class='stat-value' id='max2'>0.0</div></div>";
    html += "<div class='stat'><div class='stat-label'>מכות</div><div class='stat-value' id='count2'>0</div></div>";
    html += "</div>";
    html += "</div>";
    
    html += "<button class='btn' onclick='resetTraining()'>🔄 איפוס אימון</button>";
    // html += "<button class='btn' onclick='calibrateSensors()' style='margin-top:10px; background: linear-gradient(45deg, #4ECDC4, #44A08D);'>🎯 כיול מחדש</button>";
    html += "</div>";
    
    html += "<script>";
    html += "function updateDisplay() {";
    html += "fetch('/api/data')";
    html += ".then(response => response.json())";
    html += ".then(data => {";
    html += "document.getElementById('current1').textContent = data.sensor1.current.toFixed(1);";
    html += "document.getElementById('max1').textContent = data.sensor1.max.toFixed(1);";
    html += "document.getElementById('count1').textContent = data.sensor1.punches;";
    html += "document.getElementById('current2').textContent = data.sensor2.current.toFixed(1);";
    html += "document.getElementById('max2').textContent = data.sensor2.max.toFixed(1);";
    html += "document.getElementById('count2').textContent = data.sensor2.punches;";
    html += "document.getElementById('totalPunches').textContent = data.totalPunches;";
    html += "document.getElementById('trainingTime').textContent = data.trainingTime;";
    html += "updatePercentages(data);";
    html += "})";
    html += ".catch(error => console.log('Connection error'));";
    html += "}";
    
    html += "function updatePercentages(data) {";
    html += "const total = data.totalPunches;";
    html += "if (total === 0) {";
    html += "document.getElementById('upperPercent').style.width = '50%';";
    html += "document.getElementById('lowerPercent').style.width = '50%';";
    html += "document.getElementById('upperPercent').textContent = 'עליון';";
    html += "document.getElementById('lowerPercent').textContent = 'תחתון';";
    html += "return;";
    html += "}";
    html += "const upperPercent = Math.round((data.sensor1.punches * 100) / total);";
    html += "const lowerPercent = Math.round((data.sensor2.punches * 100) / total);";
    html += "document.getElementById('upperPercent').style.width = upperPercent + '%';";
    html += "document.getElementById('lowerPercent').style.width = lowerPercent + '%';";
    html += "document.getElementById('upperPercent').textContent = upperPercent + '%';";
    html += "document.getElementById('lowerPercent').textContent = lowerPercent + '%';";
    html += "}";
    
    html += "function resetTraining() {";
    html += "if (confirm('האם לאפס את האימון?')) {";
    html += "fetch('/api/reset', {method: 'POST'}).then(() => updateDisplay());";
    html += "}";
    html += "}";
    
    html += "function calibrateSensors() {";
    html += "if (confirm('אנא הנח את החיישנים במצב רגוע ולחץ אישור לכיול')) {";
    html += "fetch('/api/calibrate', {method: 'POST'})";
    html += ".then(response => response.text())";
    html += ".then(data => alert('כיול הושלם בהצלחה!'));";
    html += "}";
    html += "}";
    
    html += "setInterval(updateDisplay, 500);";
    html += "updateDisplay();";
    html += "</script>";
    html += "</body>";
    html += "</html>";
    
    server.send(200, "text/html", html);
}

void handleApiData() {
    unsigned long training_duration = millis() - training_start_time;
    unsigned long minutes = (training_duration % 3600000) / 60000;
    unsigned long seconds = (training_duration % 60000) / 1000;
    
    String training_time = "";
    if (minutes < 10) training_time += "0";
    training_time += String(minutes) + ":";
    if (seconds < 10) training_time += "0";
    training_time += String(seconds);
    
    String response = "{";
    
    // חיישן 1
    response += "\"sensor1\":{";
    response += "\"current\":" + String(sensor1.current_punch, 1) + ",";
    response += "\"max\":" + String(sensor1.max_punch, 1) + ",";
    response += "\"punches\":" + String(sensor1.punch_count);
    response += "},";
    
    // חיישן 2
    response += "\"sensor2\":{";
    response += "\"current\":" + String(sensor2.current_punch, 1) + ",";
    response += "\"max\":" + String(sensor2.max_punch, 1) + ",";
    response += "\"punches\":" + String(sensor2.punch_count);
    response += "},";
    
    // נתונים כלליים
    response += "\"totalPunches\":" + String(total_punches) + ",";
    response += "\"trainingTime\":\"" + training_time + "\"";
    response += "}";
    
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", response);
}

void handleReset() {
    resetSensorData(&sensor1);
    resetSensorData(&sensor2);
    total_punches = 0;
    training_start_time = millis();
    
    // איפוס למידה
    learning_index = 0;
    learning_complete = false;
    PUNCH_THRESHOLD = 0.8; // חזרה לברירת מחדל
    
    Serial.println("🔄 אימון אופס!");
    
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "text/plain", "OK");
}

void printStatus() {
    unsigned long training_duration = millis() - training_start_time;
    unsigned long minutes = (training_duration % 3600000) / 60000;
    unsigned long seconds = (training_duration % 60000) / 1000;
    
    Serial.println("\n" + String("=").substring(0, 50));
    Serial.print("⏱️  זמן אימון: ");
    if (minutes < 10) Serial.print("0");
    Serial.print(minutes);
    Serial.print(":");
    if (seconds < 10) Serial.print("0");
    Serial.println(seconds);
    
    Serial.print("🥊 סה''כ מכות: ");
    Serial.println(total_punches);
    
    Serial.println("\n📊 נתונים לפי אזור:");
    Serial.printf("🎯 עליון  | מכות: %2d | מקס: %.1f | נוכחי: %.1f\n", 
                  sensor1.punch_count, sensor1.max_punch, sensor1.current_punch);
    Serial.printf("💪 תחתון  | מכות: %2d | מקס: %.1f | נוכחי: %.1f\n", 
                  sensor2.punch_count, sensor2.max_punch, sensor2.current_punch);
    
    // חישוב אחוזים
    if (total_punches > 0) {
        Serial.println("\n📈 התפלגות מכות:");
        Serial.printf("עליון: %d%% | תחתון: %d%%\n",
                      (sensor1.punch_count * 100) / total_punches,
                      (sensor2.punch_count * 100) / total_punches);
    }
    
    // מצב למידה
    if (!learning_complete) {
        Serial.printf("🎓 למידה: %d/%d | רף נוכחי: %.2f\n", 
                      learning_index, LEARNING_SAMPLE_SIZE, PUNCH_THRESHOLD);
    } else {
        Serial.printf("✅ למידה הושלמה | רף: %.2f\n", PUNCH_THRESHOLD);
    }
    
    Serial.println(String("=").substring(0, 50));
}

/*
 * הוראות התקנה למערכת 2 חיישנים יציבה:
 * 
 * חיווט:
 * חיישן 1 (עליון): SDA=21, SCL=22, VCC=3.3V, GND=GND, AD0=GND (כתובת 0x68)
 * חיישן 2 (תחתון): SDA=25, SCL=26, VCC=3.3V, GND=GND, AD0=GND (כתובת 0x68)
 * 
 * הערה חשובה: שני החיישנים באותה כתובת אבל על I2C buses נפרדים!
 * 
 * יתרונות:
 * ✅ רק 2 I2C hardware buses - יציב מאוד
 * ✅ שני החיישנים עם חיווט זהה - קל יותר
 * ✅ לא צריך לחבר AD0 ל-3.3V באף חיישן
 * ✅ פחות צריכת זרם
 * ✅ קל יותר לאבחון בעיות
 * ✅ ביצועים מהירים יותר
 * ✅ פחות נקודות כשל
 * 
 * שימוש:
 * 1. העלה את הקוד לESP32
 * 2. פתח Serial Monitor (115200 baud)
 * 3. התחבר לרשת "BoxingSensor" עם סיסמה "12345678"
 * 4. פתח http://192.168.4.1 בטלפון
 * 5. התחל לאמן!
 * 
 * החיישן העליון יכסה את אזור הראש והגוף העליון
 * החיישן התחתון יכסה את אזור הכבד והגוף התחתון
 * 
 * תכונות:
 * - זיהוי חכם של מכות
 * - כיול אוטומטי אחרי כל מכה
 * - למידה אוטומטית של עוצמת המשתמש
 * - ממשק טלפון יפה ויציב
 * - התפלגות מכות באחוזים
 * - חישוב BPM
 * - דיווחים מפורטים ב-Serial
 * - מהירות עד 8+ מכות לשנייה
 */