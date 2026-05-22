pipeline {
    agent any

    environment {
        DOCKER_REGISTRY   = "docker.io"
        DOCKER_USERNAME   = "abdulwadood001"
        IMAGE_NAME        = "notes-webapp"
        REPO_URL          = "https://github.com/abdulwadood-001/k8s-webapp.git"
        KUBECONFIG        = "/var/lib/jenkins/.kube/config"
    }

    stages {

        // ─────────────────────────────────────────────
        // STAGE 1 — Code Fetch  [6 marks]
        // ─────────────────────────────────────────────
        stage('Code Fetch') {
            steps {
                echo "=== Fetching code from GitHub ==="
                git branch: 'main',
                    credentialsId: 'github-pat',
                    url: "${REPO_URL}"
                sh 'echo "--- Repository contents ---" && ls -la'
            }
        }

        // ─────────────────────────────────────────────
        // STAGE 2 — Docker Image Creation  [10 marks]
        // ─────────────────────────────────────────────
        stage('Docker Image Creation') {
            steps {
                echo "=== Building Docker image ==="
                dir('app') {
                    sh """
                        docker build \
                            -t ${DOCKER_REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}:${BUILD_NUMBER} \
                            -t ${DOCKER_REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}:latest \
                            .
                        echo "--- Built images ---"
                        docker images | grep ${IMAGE_NAME}
                    """
                }
            }
        }

        stage('Push to DockerHub') {
            steps {
                echo "=== Pushing image to DockerHub ==="
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKERHUB_USER',
                    passwordVariable: 'DOCKERHUB_PASS'
                )]) {
                    sh """
                        echo \$DOCKERHUB_PASS | docker login -u \$DOCKERHUB_USER --password-stdin
                        docker push ${DOCKER_REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}:${BUILD_NUMBER}
                        docker push ${DOCKER_REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}:latest
                        echo "--- Image pushed successfully ---"
                    """
                }
            }
        }

        // ─────────────────────────────────────────────
        // STAGE 3 — Kubernetes Deployment  [17 marks]
        // ─────────────────────────────────────────────
        stage('Kubernetes Deployment') {
            steps {
                echo "=== Deploying to Kubernetes ==="
                sh """
                    # 1. Apply PVC for Postgres persistent storage
                    kubectl apply -f k8s/db-pvc.yaml

                    # 2. Deploy Postgres (DB must be ready before app)
                    kubectl apply -f k8s/db-deployment.yml
                    kubectl apply -f k8s/db-service.yml

                    # Wait for Postgres to be ready
                    kubectl rollout status deployment/postgres --timeout=120s

                    # 3. Update web-deployment image tag to this build number
                    sed -i "s|${DOCKER_REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}:latest|${DOCKER_REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}:${BUILD_NUMBER}|g" k8s/web-deployment.yml

                    # 4. Deploy web app
                    kubectl apply -f k8s/web-deployment.yml
                    kubectl apply -f k8s/web-service.yml
                    kubectl apply -f k8s/web-hpa.yml

                    # Wait for rollout
                    kubectl rollout status deployment/notes-webapp --timeout=120s

                    echo "--- Current pods ---"
                    kubectl get pods -o wide

                    echo "--- Services ---"
                    kubectl get svc

                    echo "--- HPA ---"
                    kubectl get hpa
                """
            }
        }

        // ─────────────────────────────────────────────
        // STAGE 4 — Prometheus / Grafana  [17 marks]
        // ─────────────────────────────────────────────
        stage('Prometheus/Grafana Setup') {
            steps {
                echo "=== Setting up Monitoring Stack ==="
                sh """
                    # Add Helm repos
                    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
                    helm repo add grafana https://grafana.github.io/helm-charts
                    helm repo update

                    # Create monitoring namespace if it doesn't exist
                    kubectl get namespace monitoring 2>/dev/null || kubectl create namespace monitoring

                    # Install Prometheus (idempotent)
                    if helm status prometheus -n monitoring > /dev/null 2>&1; then
                        echo "Prometheus already installed — upgrading..."
                        helm upgrade prometheus prometheus-community/prometheus \
                            --namespace monitoring \
                            --set server.service.type=NodePort \
                            --set server.service.nodePort=30090
                    else
                        echo "Installing Prometheus..."
                        helm install prometheus prometheus-community/prometheus \
                            --namespace monitoring \
                            --set server.service.type=NodePort \
                            --set server.service.nodePort=30090
                    fi

                    # Install Grafana (idempotent)
                    if helm status grafana -n monitoring > /dev/null 2>&1; then
                        echo "Grafana already installed — upgrading..."
                        helm upgrade grafana grafana/grafana \
                            --namespace monitoring \
                            --set service.type=NodePort \
                            --set service.nodePort=30300 \
                            --set adminPassword=admin123
                    else
                        echo "Installing Grafana..."
                        helm install grafana grafana/grafana \
                            --namespace monitoring \
                            --set service.type=NodePort \
                            --set service.nodePort=30300 \
                            --set adminPassword=admin123
                    fi

                    # Wait for monitoring pods
                    kubectl rollout status deployment/prometheus-server -n monitoring --timeout=180s
                    kubectl rollout status deployment/grafana -n monitoring --timeout=180s

                    echo "--- Monitoring Pods ---"
                    kubectl get pods -n monitoring

                    echo "--- Monitoring Services ---"
                    kubectl get svc -n monitoring

                    echo "Grafana: http://\$(minikube ip):30300  (admin / admin123)"
                    echo "Prometheus: http://\$(minikube ip):30090"
                """
            }
        }
    }

    post {
        success {
            echo "Pipeline completed successfully!"
            echo "App URL: http://\$(minikube ip):30080"
        }
        failure {
            echo "Pipeline FAILED. Check the logs above."
        }
        always {
            // Clean up dangling Docker images to save disk space
            sh 'docker image prune -f || true'
        }
    }
}
