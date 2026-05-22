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
    }

    stages {

        stage('Code Checkout') {
            steps {
                git branch: 'main', url: "${REPO_URL}"
            }
        }

        stage('Build Image') {
            steps {
                dir('app') {
                    sh """
                        docker build -t $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER .
                        docker tag $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER \
                                    $DOCKER_USERNAME/$IMAGE_NAME:latest
                    """
                }
            }
        }

        stage('Push Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'USER',
                    passwordVariable: 'PASS'
                )]) {
                    sh """
                        echo $PASS | docker login -u $USER --password-stdin
                        docker push $DOCKER_USERNAME/$IMAGE_NAME:$BUILD_NUMBER
                        docker push $DOCKER_USERNAME/$IMAGE_NAME:latest
                    """
                }
            }
        }

        stage('Deploy App') {
            steps {
                sh """
                    kubectl apply -f K8s/db-pvc.yaml
                    kubectl apply -f K8s/db-deployment.yml
                    kubectl apply -f K8s/db-service.yml

                    kubectl apply -f K8s/web-deployment.yml
                    kubectl apply -f K8s/web-service.yml
                    kubectl apply -f K8s/web-hpa.yml

                    kubectl rollout status deployment/notes-webapp --timeout=180s
                """
            }
        }

        stage('Expose App') {
            steps {
                sh """
                    kubectl patch svc notes-webapp-svc \
                    -p '{"spec":{"type":"NodePort","ports":[{"port":3000,"targetPort":3000,"nodePort":30080}]}}'
                """
            }
        }

        stage('Install Monitoring Stack') {
            steps {
                sh """
                    kubectl create namespace $MONITORING_NS || true

                    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts || true
                    helm repo update

                    helm upgrade --install $HELM_RELEASE prometheus-community/kube-prometheus-stack \
                        --namespace $MONITORING_NS \
                        --set grafana.service.type=NodePort \
                        --set grafana.service.nodePort=$GRAFANA_PORT \
                        --set grafana.adminPassword=admin123 \
                        --set prometheus.ingress.enabled=true \
                        --set prometheus.ingress.hosts[0]=prometheus.local \
                        --wait \
                        --timeout 10m
                """
            }
        }

        stage('Expose Prometheus (PRODUCTION FIX)') {
            steps {
                sh """
                    echo "Installing NGINX Ingress Controller (if not installed)"
                    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/cloud/deploy.yaml || true

                    sleep 20

                    echo "Prometheus will be accessible via Ingress"
                    kubectl get ingress -n $MONITORING_NS || true
                """
            }
        }

        stage('Verify') {
            steps {
                sh """
                    kubectl get pods -A
                    kubectl get svc -A
                """
            }
        }
    }

    post {
        success {
            sh """
                IP=$(curl -s ifconfig.me)

                echo "====================================="
                echo "DEPLOYMENT SUCCESS"
                echo "====================================="
                echo "APP        : http://$IP:30080"
                echo "GRAFANA    : http://$IP:30090"
                echo "PROMETHEUS : http://$IP (via Ingress)"
                echo "====================================="
            """
        }

        failure {
            echo "PIPELINE FAILED"
        }
    }
}