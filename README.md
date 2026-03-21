# Smart Home IoT — Fullstack Project

## Cấu trúc thư mục

```
fullstack IOT/
├── backend/
│   ├── src/
│   │   ├── index.js                  # Entry point Express app
│   │   ├── routes/
│   │   │   ├── dashboardRoutes.js    # GET /api/dashboard
│   │   │   ├── sensorRoutes.js       # GET /api/sensors
│   │   │   ├── deviceRoutes.js       # GET/POST /api/devices
│   │   │   └── actionRoutes.js       # GET /api/actions
│   │   └── services/
│   │       ├── mqttService.js        # Kết nối Mosquitto MQTT broker
│   │       ├── mongoService.js       # Kết nối MongoDB Compass
│   │       └── dataStore.js          # In-memory store (có thể thay bằng DB)
│   ├── .env                          # Cấu hình môi trường
│   └── package.json
└── frontend/
    ├── public/
    │   └── index.html
    └── src/
        ├── App.js
        ├── index.js
        ├── layouts/
        │   ├── MainLayout.jsx        # Sidebar + outlet
        │   └── MainLayout.css
        ├── pages/
        │   ├── Dashboard.jsx         # Trang dashboard (no-scroll)
        │   ├── Dashboard.css
        │   ├── DataSensor.jsx        # Trang dữ liệu cảm biến
        │   ├── ActionHistory.jsx     # Trang lịch sử hành động
        │   ├── Profile.jsx           # Trang hồ sơ
        │   └── PageTable.css         # Shared table styles
        └── services/
            └── api.js                # Axios API calls
```

## Cài đặt & Chạy

### 1. Backend

```bash
cd backend
npm install
# Sao chép và chỉnh sửa cấu hình nếu cần
copy .env.example .env
npm run dev
```

Server chạy tại: `http://localhost:5000`

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

App chạy tại: `http://localhost:3000`

---

## Cấu hình MQTT (hardware thật)

Chỉnh file `backend/.env`:

```
MQTT_HOST=10.239.205.63      # IP của Mosquitto broker
MQTT_PORT=8888
MQTT_USERNAME=phunganhvan
MQTT_PASSWORD=13122004

TOPIC_SENSOR_DATA=sensor/data
TOPIC_DEVICE_CONTROL=device/control
TOPIC_DEVICE_STATUS=device/status
```

## Cấu hình MongoDB Compass

Trong file `backend/.env`, dùng URI MongoDB từ Compass:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/smarthome_iot
MONGODB_DB_NAME=smarthome_iot
```

Ví dụ khi dùng MongoDB Atlas (nếu cần):

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/smarthome_iot
MONGODB_DB_NAME=smarthome_iot
```

Bạn có thể kiểm tra trạng thái Mongo bằng API:

`GET /api/health` → field `mongo` sẽ là `connected` hoặc `disconnected`.

### Payload từ hardware → Backend (subscribe)

**Topic `sensor/data`:**
```json
{
  "sensor_id": "ESP32_001",
  "temperature": 25.8,
  "humidity": 73,
  "light_raw": 1379,
  "light_percent": 33,
  "light_digital": 0,
  "is_dark": false,
  "timestamp": 240520
}
```

Ghi chú:
- Backend sẽ dùng thời gian hiện tại ở server cho trường `timestamp` khi lưu dữ liệu.
- `timestamp` từ phần cứng vẫn được giữ lại dưới dạng `hw_timestamp`.

**Topic `device/status`:**
```json
{
  "device": "Living Room Light",
  "action": "Turn ON",
  "status": "ON",
  "timestamp": "2024-01-01 10:00:00"
}
```

### Payload Backend → Hardware (publish)

**Topic `device/control`:**
```json
{
  "device": "Living Room Light",
  "action": "ON",
  "timestamp": "2024-01-01 10:00:00"
}
```

---

## API Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| GET | `/api/health` | Kiểm tra server + MQTT |
| GET | `/api/dashboard` | Dữ liệu trang dashboard |
| GET | `/api/sensors?page=1&limit=10&search=&type=&sort=timestamp&order=desc` | Dữ liệu cảm biến |
| GET | `/api/sensors/packets?page=1&limit=10&search=&sensor_id=&sort=timestamp&order=desc` | Dữ liệu packet từ hardware (sensor_id, temperature, humidity, light, timestamp) |
| GET | `/api/sensors/latest` | Packet mới nhất từ hardware |
| GET | `/api/actions?page=1&limit=10&search=&device=&order=desc` | Lịch sử hành động |
| GET | `/api/devices` | Trạng thái thiết bị |
| POST | `/api/devices/control` | Bật / tắt thiết bị |

**POST /api/devices/control body:**
```json
{ "device": "Living Room Light", "action": "ON" }
```
