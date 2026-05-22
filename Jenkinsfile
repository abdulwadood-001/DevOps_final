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
                echo "=== Deploying to Kubernetes ==="
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
                    kubectl get hpa
                '''
            }
        }

        stage('Expose Services (FIXED PORTS)') {
            steps {
                sh '''
                    echo "=== Exposing Services with FIXED NodePorts ==="

                    # APP
                    kubectl patch svc notes-webapp-svc -p '{"spec":{"type":"NodePort","ports":[{"port":3000,"targetPort":3000,"nodePort":30080}]}}'

                    # GRAFANA
                    kubectl patch svc monitoring-grafana -n monitoring -p '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":3000,"nodePort":30090}]}}'

                    # PROMETHEUS
                    kubectl patch svc monitoring-kube-prometheus-prometheus -n monitoring -p '{"spec":{"type":"NodePort","ports":[{"port":9090,"targetPort":9090,"nodePort":30091}]}}'

                    echo "=== FINAL SERVICES ==="
                    kubectl get svc -A
                '''
            }
        }
    }

    post {
        success {
            echo "PIPELINE SUCCESS ✔"
            echo "APP: http://<EC2-IP>:30080"
            echo "GRAFANA: http://<EC2-IP>:30090"
            echo "PROMETHEUS: http://<EC2-IP>:30091"
        }
        failure {
            echo "PIPELINE FAILED ❌"
        }
    }
}