pipeline {
    agent any

    environment {
        DOCKER_USERNAME = "abdulwadood001"
        IMAGE_NAME      = "notes-webapp"
        REPO_URL        = "https://github.com/abdulwadood-001/DevOps_final.git"

        MONITORING_NS   = "monitoring"
        HELM_RELEASE    = "monitoring"

        APP_PORT        = "30080"
        GRAFANA_PORT    = "30090"
        PROMETHEUS_PORT = "9090"
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
                        docker tag $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER \
                                   $DOCKER_USERNAME/$IMAGE_NAME:latest
                    '''
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'USER',
                    passwordVariable: 'PASS'
                )]) {
                    sh '''
                        echo $PASS | docker login -u $USER --password-stdin
                        docker push $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER
                        docker push $DOCKER_USERNAME/$IMAGE_NAME:latest
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
                    kubectl rollout status deployment/postgres --timeout=180s
                '''
            }
        }

        stage('Deploy Application') {
            steps {
                sh '''
                    sed -i "s|image: .*|image: $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER|g" K8s/web-deployment.yml

                    kubectl apply -f K8s/web-deployment.yml
                    kubectl apply -f K8s/web-service.yml
                    kubectl apply -f K8s/web-hpa.yml

                    kubectl rollout status deployment/notes-webapp --timeout=180s
                '''
            }
        }

        stage('Expose Application') {
            steps {
                sh '''
                    kubectl patch svc notes-webapp-svc --type=merge \
                    -p '{"spec":{"type":"NodePort","ports":[{"port":3000,"targetPort":3000,"nodePort":30080}]}}' || true
                '''
            }
        }

        stage('Install Monitoring Stack') {
            steps {
                sh '''
                    kubectl get namespace $MONITORING_NS || kubectl create namespace $MONITORING_NS

                    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts || true
                    helm repo update

                    helm upgrade --install $HELM_RELEASE prometheus-community/kube-prometheus-stack \
                        --namespace $MONITORING_NS \
                        --set grafana.adminPassword=admin123 \
                        --wait --timeout 10m
                '''
            }
        }

        stage('Wait for Monitoring') {
            steps {
                sh '''
                    kubectl rollout status deployment/monitoring-grafana -n monitoring --timeout=300s || true
                    kubectl rollout status statefulset/prometheus-monitoring-kube-prometheus-prometheus -n monitoring --timeout=300s || true
                '''
            }
        }

        stage('Expose Prometheus (FIXED PORT-FORWARD)') {
            steps {
                sh '''
                    pkill -f "kubectl port-forward" || true

                    nohup kubectl port-forward \
                        -n monitoring \
                        svc/monitoring-kube-prometheus-prometheus \
                        9090:9090 \
                        --address 0.0.0.0 \
                        > prometheus.log 2>&1 &

                    sleep 10

                    curl -s http://localhost:9090 || true
                '''
            }
        }

        stage('Expose Grafana (OPTIONAL SAFE)') {
            steps {
                sh '''
                    pkill -f "30090:80" || true

                    nohup kubectl port-forward \
                        -n monitoring \
                        svc/monitoring-grafana \
                        30090:80 \
                        --address 0.0.0.0 \
                        > grafana.log 2>&1 &

                    sleep 5
                '''
            }
        }

        stage('Verify') {
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
                IP=$(curl -s ifconfig.me)

                echo "DEPLOYMENT SUCCESSFUL"
                echo "APP        : http://$IP:30080"
                echo "GRAFANA    : http://$IP:30090"
                echo "PROMETHEUS : http://$IP:9090"
                echo "USER: admin"
                echo "PASS: admin123"
            '''
        }

        failure {
            echo "PIPELINE FAILED"
        }
    }
}