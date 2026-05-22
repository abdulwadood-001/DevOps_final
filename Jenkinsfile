pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = "docker.io"
        DOCKER_USERNAME = "abdulwadood001"
        IMAGE_NAME = "notes-webapp"
        REPO_URL = "https://github.com/abdulwadood-001/DevOps_final.git"
    }

    stages {

        stage('Code Fetch') {
            steps {
                echo "=== Cloning repository ==="
                git branch: 'main', url: "${REPO_URL}"
                sh 'ls -la'
            }
        }

        stage('Docker Build') {
            steps {
                echo "=== Building Docker Image ==="
                dir('app') {
                    sh '''
                        docker build -t $DOCKER_REGISTRY/$DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER .
                        docker tag $DOCKER_REGISTRY/$DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER \
                                   $DOCKER_REGISTRY/$DOCKER_USERNAME/$IMAGE_NAME:latest
                    '''
                }
            }
        }

        stage('Push to DockerHub') {
            steps {
                echo "=== Pushing Image ==="
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'USER',
                    passwordVariable: 'PASS'
                )]) {
                    sh '''
                        echo $PASS | docker login -u $USER --password-stdin
                        docker push $DOCKER_REGISTRY/$DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER
                        docker push $DOCKER_REGISTRY/$DOCKER_USERNAME/$IMAGE_NAME:latest
                    '''
                }
            }
        }

        stage('Kubernetes Deploy') {
            steps {
                echo "=== Deploying App to Kubernetes ==="
                sh '''
                    set -e

                    kubectl apply -f K8s/db-pvc.yaml
                    kubectl apply -f K8s/db-deployment.yml
                    kubectl apply -f K8s/db-service.yml

                    kubectl rollout status deployment/postgres --timeout=180s

                    kubectl apply -f K8s/web-deployment.yml
                    kubectl apply -f K8s/web-service.yml
                    kubectl apply -f K8s/web-hpa.yml

                    kubectl rollout status deployment/notes-webapp --timeout=180s

                    kubectl get pods -o wide
                    kubectl get svc
                '''
            }
        }

        // ✅ NEW STAGE — Install Prometheus and Grafana
        stage('Setup Monitoring') {
            steps {
                echo "=== Installing Prometheus and Grafana ==="
                sh '''
                    set -e

                    # Add helm repo if not already added
                    helm repo add prometheus-community \
                        https://prometheus-community.github.io/helm-charts || true
                    helm repo update

                    # Install only if not already installed
                    if helm status monitoring -n monitoring > /dev/null 2>&1; then
                        echo "Monitoring stack already installed, upgrading..."
                        helm upgrade monitoring prometheus-community/kube-prometheus-stack \
                            --namespace monitoring \
                            --set prometheus.service.type=NodePort \
                            --set prometheus.service.nodePort=30091 \
                            --set grafana.service.type=NodePort \
                            --set grafana.service.nodePort=30090 \
                            --set grafana.adminPassword=admin123
                    else
                        echo "Installing monitoring stack fresh..."
                        helm install monitoring prometheus-community/kube-prometheus-stack \
                            --namespace monitoring \
                            --create-namespace \
                            --set prometheus.service.type=NodePort \
                            --set prometheus.service.nodePort=30091 \
                            --set grafana.service.type=NodePort \
                            --set grafana.service.nodePort=30090 \
                            --set grafana.adminPassword=admin123
                    fi

                    # Wait for Prometheus to be ready
                    kubectl rollout status deployment/monitoring-kube-prometheus-operator \
                        -n monitoring --timeout=180s

                    # Wait for Grafana to be ready
                    kubectl rollout status deployment/monitoring-grafana \
                        -n monitoring --timeout=180s

                    echo "=== Monitoring stack ready ==="
                    kubectl get pods -n monitoring
                    kubectl get svc -n monitoring
                '''
            }
        }

        // ✅ NEW STAGE — Expose Everything via Port Forward
        stage('Expose All Services') {
            steps {
                echo "=== Exposing all services ==="
                sh '''
                    # Kill any old port-forwards
                    pkill -f "port-forward" || true
                    sleep 2

                    # Expose App
                    kubectl port-forward svc/notes-webapp-svc \
                        30080:3000 --address 0.0.0.0 &

                    # Expose Prometheus
                    kubectl port-forward -n monitoring \
                        svc/monitoring-kube-prometheus-prometheus \
                        30091:9090 --address 0.0.0.0 &

                    # Expose Grafana
                    kubectl port-forward -n monitoring \
                        svc/monitoring-grafana \
                        30090:80 --address 0.0.0.0 &

                    sleep 5

                    # Verify all are working
                    echo "=== Verifying services ==="
                    curl -s http://localhost:30080/healthz \
                        && echo " App is UP ✅" || echo " App is DOWN ❌"
                    curl -s http://localhost:30091/-/healthy \
                        && echo " Prometheus is UP ✅" || echo " Prometheus is DOWN ❌"
                    curl -s http://localhost:30090 > /dev/null \
                        && echo "Grafana is UP ✅" || echo "Grafana is DOWN ❌"
                '''
            }
        }
    }

    post {
        success {
            sh '''
                EC2_IP=$(curl -s ifconfig.me)
                echo "============================================"
                echo "PIPELINE SUCCESS ✅"
                echo "============================================"
                echo "App         → http://$EC2_IP:30080"
                echo "Prometheus  → http://$EC2_IP:30091"
                echo "Grafana     → http://$EC2_IP:30090"
                echo "Grafana Login → admin / admin123"
                echo "============================================"
            '''
        }
        failure {
            echo "PIPELINE FAILED ❌"
        }
    }
}