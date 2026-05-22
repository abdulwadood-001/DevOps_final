pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = "docker.io"
        DOCKER_USERNAME = "abdulwadood001"
        IMAGE_NAME      = "notes-webapp"
        REPO_URL        = "https://github.com/abdulwadood-001/DevOps_final.git"

        MONITORING_NS   = "monitoring"
        HELM_RELEASE    = "monitoring"

        APP_PORT        = "30080"
        GRAFANA_PORT    = "30090"
        PROMETHEUS_PORT = "30091"
    }

    stages {

        stage('Clone Repository') {
            steps {
                git branch: 'main', url: "${REPO_URL}"
            }
        }

        stage('Build Docker Image') {
            steps {
                dir('app') {
                    sh '''
                        docker build -t $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER .

                        docker tag \
                        $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER \
                        $DOCKER_USERNAME/$IMAGE_NAME:latest
                    '''
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {

                    sh '''
                        echo $DOCKER_PASS | docker login \
                        -u $DOCKER_USER --password-stdin

                        docker push \
                        $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER

                        docker push \
                        $DOCKER_USERNAME/$IMAGE_NAME:latest
                    '''
                }
            }
        }

        stage('Deploy Database') {
            steps {
                sh '''
                    kubectl apply -f K8s/db-pvc.yaml
                    kubectl apply -f K8s/db-deployment.yml
                    kubectl apply -f K8s/db-service.yml

                    kubectl rollout status deployment/postgres \
                    --timeout=180s
                '''
            }
        }

        stage('Deploy Application') {
            steps {
                sh '''
                    sed -i "s|image: .*|image: $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER|g" \
                    K8s/web-deployment.yml

                    kubectl apply -f K8s/web-deployment.yml
                    kubectl apply -f K8s/web-service.yml
                    kubectl apply -f K8s/web-hpa.yml

                    kubectl rollout status deployment/notes-webapp \
                    --timeout=180s
                '''
            }
        }

        stage('Expose Application') {
            steps {
                sh '''
                    kubectl patch svc notes-webapp-svc \
                    --type='merge' \
                    -p '{
                        "spec": {
                            "type": "NodePort",
                            "ports": [{
                                "port": 3000,
                                "targetPort": 3000,
                                "nodePort": 30080
                            }]
                        }
                    }' || true
                '''
            }
        }

        stage('Install Monitoring Stack') {
            steps {
                sh '''
                    kubectl get namespace $MONITORING_NS || \
                    kubectl create namespace $MONITORING_NS

                    helm repo add prometheus-community \
                    https://prometheus-community.github.io/helm-charts || true

                    helm repo update

                    helm upgrade --install $HELM_RELEASE \
                    prometheus-community/kube-prometheus-stack \
                    --namespace $MONITORING_NS \
                    --set grafana.service.type=NodePort \
                    --set grafana.service.nodePort=$GRAFANA_PORT \
                    --set prometheus.service.type=NodePort \
                    --set prometheus.service.nodePort=$PROMETHEUS_PORT \
                    --set grafana.adminPassword=admin123 \
                    --wait \
                    --timeout 10m
                '''
            }
        }

        stage('Wait for Monitoring Pods') {
            steps {
                sh '''
                    kubectl rollout status \
                    deployment/monitoring-grafana \
                    -n monitoring \
                    --timeout=300s

                    kubectl rollout status \
                    statefulset/prometheus-monitoring-kube-prometheus-prometheus \
                    -n monitoring \
                    --timeout=300s
                '''
            }
        }

        stage('Verify Monitoring Services') {
            steps {
                sh '''
                    echo "Checking Grafana"
                    curl http://192.168.49.2:$GRAFANA_PORT || true

                    echo ""
                    echo "Checking Prometheus"
                    curl http://192.168.49.2:$PROMETHEUS_PORT || true

                    echo ""
                    kubectl get svc -n monitoring
                '''
            }
        }

        stage('Verify Deployment') {
            steps {
                sh '''
                    kubectl get pods -A
                    kubectl get svc -A
                '''
            }
        }
    }

    post {
        success {
            sh '''
                PUBLIC_IP=$(curl -s ifconfig.me)

                echo ""
                echo "====================================="
                echo "DEPLOYMENT SUCCESSFUL"
                echo "====================================="
                echo "Application : http://$PUBLIC_IP:30080"
                echo "Grafana     : http://$PUBLIC_IP:30090"
                echo "Prometheus  : http://$PUBLIC_IP:30091"
                echo ""
                echo "Grafana Login"
                echo "Username : admin"
                echo "Password : admin123"
                echo "====================================="
            '''
        }

        failure {
            echo "Pipeline failed"
        }
    }
}