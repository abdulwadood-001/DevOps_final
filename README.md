# DevOps Notes App — CSC418 Lab Project
**Name:** Abdul Wadood  
**GitHub:** abdulwadood-001  
**DockerHub:** abdulwadood001  

---

## Directory Structure

```
k8s-webapp/
├── app/
│   ├── server.js          ← Node.js + Express web app
│   ├── package.json
│   └── Dockerfile
├── k8s/
│   ├── db-pvc.yaml        ← PostgreSQL PersistentVolumeClaim
│   ├── db-deployment.yml  ← PostgreSQL Deployment
│   ├── db-service.yml     ← PostgreSQL ClusterIP Service
│   ├── web-deployment.yml ← Notes App Deployment (2 replicas)
│   ├── web-service.yml    ← Notes App NodePort Service (:30080)
│   └── web-hpa.yml        ← HorizontalPodAutoscaler
├── Jenkinsfile            ← Full CI/CD pipeline
└── README.md
```

---

## Step-by-Step Commands

### 0. Push code to GitHub

```bash
git init
git remote add origin https://github.com/abdulwadood-001/k8s-webapp.git
git add .
git commit -m "Initial commit: DevOps notes app"
git branch -M main
git push -u origin main
```

---

### 1. Launch EC2 + Install Jenkins

```bash
# On your AWS EC2 Ubuntu instance:
sudo apt update && sudo apt upgrade -y

# Install Java (Jenkins dependency)
sudo apt install -y openjdk-17-jdk

# Add Jenkins repo and install
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee \
  /usr/share/keyrings/jenkins-keyring.asc > /dev/null
echo deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/ | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update && sudo apt install -y jenkins

# Start Jenkins
sudo systemctl enable jenkins && sudo systemctl start jenkins

# Get initial admin password
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Access Jenkins at: `http://<EC2-PUBLIC-IP>:8080`

---

### 2. Install Jenkins Plugins

Go to **Manage Jenkins → Plugins → Available** and install:
- Git
- GitHub
- Pipeline
- Docker Pipeline
- Docker Commons
- Kubernetes CLI

---

### 3. Add Credentials in Jenkins

**Manage Jenkins → Credentials → Global → Add Credential:**

| ID | Type | Details |
|---|---|---|
| `github-pat` | Username + Password | GitHub username + Personal Access Token |
| `dockerhub-creds` | Username + Password | `abdulwadood001` + DockerHub password |

---

### 4. Install Docker on EC2

```bash
sudo apt install -y docker.io
sudo systemctl enable docker && sudo systemctl start docker

# Allow Jenkins user to run Docker
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
```

---

### 5. Install Minikube + kubectl on EC2

```bash
# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# minikube
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# Start minikube (as ubuntu user)
minikube start --driver=docker

# Verify
kubectl get nodes
```

---

### 6. Give Jenkins Access to Kubernetes

```bash
# Run as ubuntu user on EC2
sudo mkdir -p /var/lib/jenkins/.kube
sudo cp /home/ubuntu/.kube/config /var/lib/jenkins/.kube/config
sudo chown -R jenkins:jenkins /var/lib/jenkins/.kube

# Allow Jenkins to read minikube certs
sudo chmod -R a+r /home/ubuntu/.minikube
sudo find /home/ubuntu/.minikube -type d -exec chmod a+x {} \;
```

---

### 7. Install Helm (for Prometheus/Grafana)

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

---

### 8. Create Jenkins Pipeline Job

1. New Item → **Pipeline** → name it `notes-webapp-pipeline`
2. Under **Pipeline** section → choose **Pipeline script from SCM**
3. SCM: **Git**  
   Repository URL: `https://github.com/abdulwadood-001/k8s-webapp.git`  
   Credentials: `github-pat`  
   Branch: `*/main`
4. Script Path: `Jenkinsfile`
5. Save → **Build Now**

---

### 9. GitHub Webhook (Auto-trigger on push)

1. Go to your GitHub repo → **Settings → Webhooks → Add webhook**
2. Payload URL: `http://<EC2-PUBLIC-IP>:8080/github-webhook/`
3. Content type: `application/json`
4. Events: **Just the push event**
5. Save

In Jenkins job → check **GitHub hook trigger for GITScm polling**

---

### 10. Test the App Manually (Optional)

```bash
# Build image locally
cd app
docker build -t abdulwadood001/notes-webapp:test .
docker run -d -p 3000:3000 \
  -e PGHOST=host.docker.internal \
  abdulwadood001/notes-webapp:test

# Apply k8s manifests manually
kubectl apply -f k8s/db-pvc.yaml
kubectl apply -f k8s/db-deployment.yml
kubectl apply -f k8s/db-service.yml
kubectl apply -f k8s/web-deployment.yml
kubectl apply -f k8s/web-service.yml
kubectl apply -f k8s/web-hpa.yml

# Check status
kubectl get pods
kubectl get svc

# Access app
minikube ip        # get the IP
# Open http://<minikube-ip>:30080
```

---

### 11. Access Prometheus & Grafana

```bash
# Get Minikube IP
minikube ip

# Prometheus: http://<minikube-ip>:30090
# Grafana:    http://<minikube-ip>:30300
#             Login: admin / admin123

# In Grafana → Add Data Source:
#   Type: Prometheus
#   URL:  http://prometheus-server.monitoring.svc.cluster.local:80

# Useful dashboards to import (by ID):
#   3662  — Prometheus 2.0 Overview
#   6417  — Kubernetes Cluster
```

---

### 12. Useful Debugging Commands

```bash
# Pod logs
kubectl logs -l app=notes-webapp
kubectl logs -l app=postgres

# Describe pod (shows events/errors)
kubectl describe pod <pod-name>

# Exec into web pod
kubectl exec -it <pod-name> -- sh

# Exec into postgres pod
kubectl exec -it <postgres-pod-name> -- psql -U appuser -d appdb

# Check HPA
kubectl get hpa

# Monitoring namespace
kubectl get all -n monitoring
```
