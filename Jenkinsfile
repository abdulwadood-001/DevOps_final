pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = "docker.io"
        DOCKER_USERNAME = "abdulwadood001"
        IMAGE_NAME      = "notes-webapp"
        REPO_URL        = "https://github.com/abdulwadood-001/DevOps_final.git"
    }

    stages {

        // ─────────────────────────────────────────
        // STAGE 1: Clone code from GitHub
        // ─────────────────────────────────────────
        stage('Code Fetch') {
            steps {
                echo "=== Cloning repository ==="
                git branch: 'main', url: "${REPO_URL}"
                sh 'ls -la'
            }
        }

        // ─────────────────────────────────────────
        // STAGE 2: Build Docker image
        // ─────────────────────────────────────────
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

        // ─────────────────────────────────────────
        // STAGE 3: Push image to DockerHub
        // ─────────────────────────────────────────
        stage('Push to DockerHub') {
            steps {
                echo "=== Pushing Image to DockerHub ==="
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

        // ─────────────────────────────────────────
        // STAGE 4: Deploy App + Database to Kubernetes
        // ─────────────────────────────────────────
        stage('Kubernetes Deploy') {
            steps {
                echo "=== Deploying App and Database to Kubernetes ==="
                sh '''
                    set -e

                    echo "--- Applying Database resources ---"
                    kubectl apply -f K8s/db-pvc.yaml
                    kubectl apply -f K8s/db-deployment.yml
                    kubectl apply -f K8s/db-service.yml

                    echo "--- Waiting for Database to be ready ---"
                    kubectl rollout status deployment/postgres --timeout=180s

                    echo "--- Applying Web App resources ---"
                    kubectl apply -f K8s/web-deployment.yml
                    kubectl apply -f K8s/web-service.yml
                    kubectl apply -f K8s/web-hpa.yml

                    echo "--- Waiting for Web App to be ready ---"
                    kubectl rollout status deployment/notes-webapp --timeout=180s

                    echo "--- Current Pods ---"
                    kubectl get pods -o wide

                    echo "--- Current Services ---"
                    kubectl get svc
                '''
            }
        }

        // ─────────────────────────────────────────
        // STAGE 5: Install or Upgrade Prometheus + Grafana
        // ─────────────────────────────────────────
        stage('Setup Monitoring') {
            steps {
                echo "=== Setting up Prometheus and Grafana ==="
                sh '''
                    set -e

                    echo "--- Adding Helm repo ---"
                    helm repo add prometheus-community \
                        https://prometheus-community.github.io/helm-charts || true
                    helm repo update

                    echo "--- Checking Helm release status ---"
                    HELM_STATUS=$(helm status monitoring -n monitoring \
                        --output json 2>/dev/null | \
                        python3 -c "import sys,json; \
                        print(json.load(sys.stdin)['info']['status'])" \
                        2>/dev/null || echo "not-installed")

                    echo "Current Helm status: $HELM_STATUS"

                    # If stuck in pending state, rollback first
                    if [ "$HELM_STATUS" = "pending-upgrade" ] || \
                       [ "$HELM_STATUS" = "pending-install" ] || \
                       [ "$HELM_STATUS" = "pending-rollback" ]; then
                        echo "--- Helm is stuck, rolling back ---"
                        helm rollback monitoring -n monitoring || true
                        sleep 10
                        HELM_STATUS=$(helm status monitoring -n monitoring \
                            --output json 2>/dev/null | \
                            python3 -c "import sys,json; \
                            print(json.load(sys.stdin)['info']['status'])" \
                            2>/dev/null || echo "not-installed")
                        echo "Status after rollback: $HELM_STATUS"
                    fi

                    # If failed state, uninstall and reinstall clean
                    if [ "$HELM_STATUS" = "failed" ]; then
                        echo "--- Helm release failed, uninstalling for clean install ---"
                        helm uninstall monitoring -n monitoring || true
                        sleep 15
                        HELM_STATUS="not-installed"
                    fi

                    # Install or upgrade based on current status
                    if [ "$HELM_STATUS" = "deployed" ]; then
                        echo "--- Monitoring already deployed, upgrading ---"
                        helm upgrade monitoring \
                            prometheus-community/kube-prometheus-stack \
                            --namespace monitoring \
                            --set prometheus.service.type=NodePort \
                            --set prometheus.service.nodePort=30091 \
                            --set grafana.service.type=NodePort \
                            --set grafana.service.nodePort=30090 \
                            --set grafana.adminPassword=admin123 \
                            --atomic \
                            --timeout 5m \
                            --cleanup-on-fail

                    else
                        echo "--- Installing monitoring stack fresh ---"
                        helm install monitoring \
                            prometheus-community/kube-prometheus-stack \
                            --namespace monitoring \
                            --create-namespace \
                            --set prometheus.service.type=NodePort \
                            --set prometheus.service.nodePort=30091 \
                            --set grafana.service.type=NodePort \
                            --set grafana.service.nodePort=30090 \
                            --set grafana.adminPassword=admin123 \
                            --atomic \
                            --timeout 5m
                    fi

                    echo "--- Waiting for Prometheus operator ---"
                    kubectl rollout status deployment/monitoring-kube-prometheus-operator \
                        -n monitoring --timeout=180s

                    echo "--- Waiting for Grafana ---"
                    kubectl rollout status deployment/monitoring-grafana \
                        -n monitoring --timeout=180s

                    echo "--- Monitoring Pods ---"
                    kubectl get pods -n monitoring

                    echo "--- Monitoring Services ---"
                    kubectl get svc -n monitoring
                '''
            }
        }

        // ─────────────────────────────────────────
        // STAGE 6: Expose all services via port-forward
        // ─────────────────────────────────────────
        stage('Expose All Services') {
            steps {
                echo "=== Exposing App, Prometheus, and Grafana ==="
                sh '''
                    echo "--- Killing old port-forwards ---"
                    pkill -f "port-forward" || true
                    sleep 3

                    echo "--- Starting port-forwards ---"

                    # Expose Notes App on port 30080
                    kubectl port-forward svc/notes-webapp-svc \
                        30080:3000 \
                        --address 0.0.0.0 &

                    # Expose Prometheus on port 30091
                    kubectl port-forward \
                        -n monitoring \
                        svc/monitoring-kube-prometheus-prometheus \
                        30091:9090 \
                        --address 0.0.0.0 &

                    # Expose Grafana on port 30090
                    kubectl port-forward \
                        -n monitoring \
                        svc/monitoring-grafana \
                        30090:80 \
                        --address 0.0.0.0 &

                    echo "--- Waiting for port-forwards to start ---"
                    sleep 8

                    echo "--- Verifying all services ---"
                    curl -s http://localhost:30080/healthz \
                        && echo "  App         is UP ✅" \
                        || echo "  App         is DOWN ❌"

                    curl -s http://localhost:30091/-/healthy \
                        && echo "  Prometheus  is UP ✅" \
                        || echo "  Prometheus  is DOWN ❌"

                    curl -s -o /dev/null -w "%{http_code}" http://localhost:30090 | \
                        grep -q "200\|302" \
                        && echo "  Grafana     is UP ✅" \
                        || echo "  Grafana     is DOWN ❌"

                    echo "--- All port-forwards running ---"
                    ps aux | grep port-forward | grep -v grep
                '''
            }
        }

        // ─────────────────────────────────────────
        // STAGE 7: Verify everything end to end
        // ─────────────────────────────────────────
        stage('Final Verification') {
            steps {
                echo "=== Final System Verification ==="
                sh '''
                    echo "=============================="
                    echo "--- All Pods (default ns) ---"
                    kubectl get pods -o wide

                    echo "--- All Pods (monitoring ns) ---"
                    kubectl get pods -n monitoring

                    echo "--- All Services (default ns) ---"
                    kubectl get svc

                    echo "--- All Services (monitoring ns) ---"
                    kubectl get svc -n monitoring

                    echo "--- HPA Status ---"
                    kubectl get hpa

                    echo "--- PVC Status ---"
                    kubectl get pvc

                    echo "--- Node Status ---"
                    kubectl get nodes

                    echo "=============================="
                    echo "--- Testing App endpoint ---"
                    curl -s http://localhost:30080/healthz

                    echo "--- Testing Prometheus endpoint ---"
                    curl -s http://localhost:30091/-/healthy

                    echo "--- Testing App metrics ---"
                    curl -s http://localhost:30080/metrics

                    echo "=============================="
                '''
            }
        }
    }

    // ─────────────────────────────────────────
    // POST: Print results after pipeline finishes
    // ─────────────────────────────────────────
    post {

        success {
            sh '''
                EC2_IP=$(curl -s ifconfig.me 2>/dev/null || \
                         curl -s http://169.254.169.254/latest/meta-data/public-ipv4 \
                         2>/dev/null || echo "<EC2-PUBLIC-IP>")

                echo ""
                echo "╔══════════════════════════════════════════╗"
                echo "║         PIPELINE SUCCESS ✅               ║"
                echo "╠══════════════════════════════════════════╣"
                echo "║  Notes App   → http://$EC2_IP:30080      ║"
                echo "║  Prometheus  → http://$EC2_IP:30091      ║"
                echo "║  Grafana     → http://$EC2_IP:30090      ║"
                echo "╠══════════════════════════════════════════╣"
                echo "║  Grafana Login:  admin / admin123         ║"
                echo "║  Build Number:   #$BUILD_NUMBER           ║"
                echo "╚══════════════════════════════════════════╝"
                echo ""
            '''
        }

        failure {
            sh '''
                echo ""
                echo "╔══════════════════════════════════════════╗"
                echo "║         PIPELINE FAILED ❌                ║"
                echo "╠══════════════════════════════════════════╣"
                echo "║  Check the stage that turned red above    ║"
                echo "║  Common fixes:                            ║"
                echo "║  1. helm rollback monitoring -n monitoring║"
                echo "║  2. kubectl get pods --all-namespaces     ║"
                echo "║  3. kubectl describe pod <pod-name>       ║"
                echo "╚══════════════════════════════════════════╝"
                echo ""
            '''
        }

        always {
            sh '''
                echo "--- Pipeline finished at $(date) ---"
                echo "--- Build #$BUILD_NUMBER ---"
                echo "--- Workspace: $WORKSPACE ---"
            '''
        }
    }
}