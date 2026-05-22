pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = "docker.io"
        DOCKER_USERNAME = "abdulwadood001"
        IMAGE_NAME      = "notes-webapp"
        REPO_URL        = "https://github.com/abdulwadood-001/DevOps_final.git"
    }

    stages {

        stage('Code Fetch') {
            steps {
                echo "Cloning repository"
                git branch: 'main', url: "${REPO_URL}"
            }
        }

        stage('Docker Build') {
            steps {
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

        stage('Deploy to Kubernetes') {
            steps {
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
                '''
            }
        }

        stage('Expose App') {
            steps {
                sh '''
                    kubectl patch svc notes-webapp-svc \
                    -p '{"spec":{"type":"NodePort","ports":[{"port":3000,"targetPort":3000,"nodePort":30080}]}}' || true
                '''
            }
        }

        stage('Install Monitoring Stack') {
            steps {
                sh '''
                    kubectl create namespace monitoring || true

                    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts || true
                    helm repo update

                    helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
                        --namespace monitoring \
                        --set grafana.service.type=NodePort \
                        --set grafana.service.nodePort=30090 \
                        --set grafana.adminPassword=admin123 \
                        --wait --timeout 10m
                '''
            }
        }

        stage('Expose Prometheus (FIXED WAY)') {
            steps {
                sh '''
                    echo "Checking Prometheus service"

                    PROM_SVC=$(kubectl get svc -n monitoring \
                        -l app.kubernetes.io/name=prometheus \
                        -o jsonpath='{.items[0].metadata.name}')

                    echo "Prometheus service: $PROM_SVC"

                    kubectl patch svc $PROM_SVC -n monitoring \
                    -p '{"spec":{"type":"NodePort","ports":[{"port":9090,"targetPort":9090,"nodePort":30091}]}}' || true
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

                echo "===================================="
                echo "DEPLOYMENT SUCCESS"
                echo "===================================="
                echo "APP        : http://$IP:30080"
                echo "GRAFANA    : http://$IP:30090"
                echo "PROMETHEUS : http://$IP:30091"
                echo "===================================="
                echo "LOGIN: admin / admin123"
            '''
        }

        failure {
            echo "PIPELINE FAILED"
        }
    }
}