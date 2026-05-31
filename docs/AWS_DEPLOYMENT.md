# FarmTrack — AWS Deployment Guide

## Architecture Overview

```
Internet → Route 53 → ALB (443) → EC2 (Docker Compose)
                                     ├── Nginx (reverse proxy)
                                     ├── React frontend
                                     ├── Flask API (Gunicorn ×4)
                                     ├── MySQL 8
                                     └── Redis
```

For 1000+ devices you'll eventually split out RDS (managed MySQL) and
ElastiCache (managed Redis) — see "Scaling" section below.

---

## 1. Launch EC2 Instance

**Recommended:** `t3.medium` (2 vCPU, 4 GB RAM) — handles ~500 devices comfortably.
For 1000+ devices: `t3.large` or split API onto `t3.medium` + RDS `db.t3.medium`.

- **AMI:** Amazon Linux 2023 or Ubuntu 22.04
- **Security Group inbound rules:**
  - TCP 22   → Your IP only (SSH)
  - TCP 80   → 0.0.0.0/0
  - TCP 443  → 0.0.0.0/0
- **Storage:** 30 GB gp3 (GPS data grows ~1 MB/device/day)
- **IAM Role:** optional — add SSM policy for parameter store secrets

---

## 2. Install Docker on the Instance

```bash
# Amazon Linux 2023
sudo yum update -y
sudo yum install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

---

## 3. Deploy the Application

```bash
# Clone / upload your code
git clone https://github.com/your-org/farmtrack.git
cd farmtrack

# Copy and edit environment file
cp backend/.env.example backend/.env
nano backend/.env
# Fill in: FLASK_SECRET_KEY, JWT_SECRET_KEY, DB_PASSWORD

# Add SSL certificates (Let's Encrypt recommended)
sudo snap install certbot --classic
sudo certbot certonly --standalone -d yourdomain.com
sudo mkdir -p docker/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem docker/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   docker/ssl/
sudo chmod 644 docker/ssl/*

# Update nginx.conf with your domain name
sed -i 's/yourdomain.com/YOUR_ACTUAL_DOMAIN/g' docker/nginx.conf

# Build and start
docker compose up -d --build

# Check everything is running
docker compose ps
docker compose logs api --tail 50
```

---

## 4. Verify Deployment

```bash
# Health check
curl https://yourdomain.com/health
# → {"service":"farmtrack-api","status":"ok"}

# Test device ingest (replace API_KEY with key from POST /api/devices)
curl -X POST https://yourdomain.com/api/location \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: YOUR_DEVICE_API_KEY" \
  -d '{"latitude":53.12345,"longitude":-6.12345,"speed":25,"heading":180,"battery":4.1,"timestamp":"2026-01-01T12:00:00Z"}'
# → {"location_id":1,"status":"ok"}
```

---

## 5. Auto-renew SSL and restart

```bash
# Add to crontab (sudo crontab -e)
0 3 * * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/yourdomain.com/*.pem /home/ec2-user/farmtrack/docker/ssl/ && \
  docker compose -f /home/ec2-user/farmtrack/docker-compose.yml restart nginx
```

---

## 6. Start on Boot

```bash
# Create systemd service
sudo tee /etc/systemd/system/farmtrack.service <<EOF
[Unit]
Description=FarmTrack GPS Platform
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/home/ec2-user/farmtrack
ExecStart=/usr/local/lib/docker/cli-plugins/docker-compose up
ExecStop=/usr/local/lib/docker/cli-plugins/docker-compose down
Restart=always
User=ec2-user

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable farmtrack
```

---

## Scaling to 1,000+ Devices

### Database
Move MySQL to **Amazon RDS** (Multi-AZ for HA):
```bash
# In backend/.env
DB_HOST=farmtrack.xxxxxx.eu-west-1.rds.amazonaws.com
DB_USER=farmtrack_user
DB_PASSWORD=your_rds_password
```
Remove the `db:` service from docker-compose.yml.

### Cache / Rate Limiting
Move Redis to **Amazon ElastiCache** (single-node `cache.t3.micro` handles 1000+ devices):
```bash
REDIS_URL=rediss://farmtrack.xxxxxx.cache.amazonaws.com:6379
```

### Horizontal API Scaling
1. Put the EC2 behind an **Application Load Balancer** (ALB).
2. Create an **Auto Scaling Group** (min 2, max 6 instances).
3. Sessions are stateless (JWT) — no sticky sessions needed.
4. Rate limiting still works because it's backed by shared Redis/ElastiCache.

### Location Table Partitioning (>50M rows)
```sql
-- Partition by month — add this to schema.sql
ALTER TABLE locations
  PARTITION BY RANGE (UNIX_TIMESTAMP(recorded_at)) (
    PARTITION p2026_01 VALUES LESS THAN (UNIX_TIMESTAMP('2026-02-01')),
    PARTITION p2026_02 VALUES LESS THAN (UNIX_TIMESTAMP('2026-03-01')),
    -- add monthly partitions going forward
    PARTITION p_future VALUES LESS THAN MAXVALUE
  );
```

### Estimated AWS Costs (1,000 devices, 30s ping interval)
| Service | Size | Monthly |
|---|---|---|
| EC2 t3.large | 1 instance | ~$60 |
| RDS t3.medium | Multi-AZ | ~$70 |
| ElastiCache t3.micro | 1 node | ~$15 |
| ALB | — | ~$20 |
| Route 53 | 1 zone | ~$1 |
| Data transfer | ~50 GB | ~$5 |
| **Total** | | **~$171/month** |

---

## Backup

```bash
# Daily MySQL dump (add to crontab)
0 2 * * * docker exec farmtrack-db mysqldump -u root -p${MYSQL_ROOT_PASSWORD} farmtrack | \
  gzip > /backups/farmtrack_$(date +%Y%m%d).sql.gz

# Optionally sync to S3
aws s3 sync /backups s3://your-bucket/farmtrack-backups/
```
