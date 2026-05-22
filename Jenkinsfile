pipeline {
    agent any

    environment {
        DOCKER_REGISTRY    = "docker.io"
        DOCKER_USERNAME    = "abdulwadood001"
        IMAGE_NAME         = "notes-webapp"
        REPO_URL           = "https://github.com/abdulwadood-001/DevOps_final.git"

        // Monitoring
        MONITORING_NS      = "monitoring"
        HELM_RELEASE       = "monitoring"
        GRAFANA_PORT       = "30090"
        PROMETHEUS_PORT    = "30091"
        APP_PORT           = "30080"
    }

    stages {

        // ─────────────────────────────────────────────
        // Stage 1 – Code Fetch
        // ─────────────────────────────────────────────
        stage('Code Fetch') {
            steps {
                echo "=== Cloning repository ==="
                git branch: 'main', url: "${REPO_URL}"
                sh 'ls -la'
            }
        }

        // ─────────────────────────────────────────────
        // Stage 2 – Docker Build
        // ─────────────────────────────────────────────
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

        // ─────────────────────────────────────────────
        // Stage 3 – Push to DockerHub
        // ─────────────────────────────────────────────
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

        // ─────────────────────────────────────────────
        // Stage 4 – Kubernetes Deploy (app)
        // ─────────────────────────────────────────────
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

                    echo "=== FINAL APP STATUS ==="
                    kubectl get pods -o wide
                    kubectl get svc
                '''
            }
        }

        // ─────────────────────────────────────────────
        // Stage 5 – Monitoring Setup (Prometheus + Grafana)
        // ─────────────────────────────────────────────
        stage('Monitoring Setup') {
            steps {
                echo "=== Setting up Prometheus & Grafana via Helm ==="
                sh '''
                    set -e

                    # ── 1. Ensure monitoring namespace exists ──────────────────────
                    kubectl get namespace $MONITORING_NS 2>/dev/null \
                        || kubectl create namespace $MONITORING_NS

                    # ── 2. Add / update the prometheus-community Helm repo ─────────
                    helm repo add prometheus-community \
                        https://prometheus-community.github.io/helm-charts 2>/dev/null || true
                    helm repo update

                    # ── 3. Install or upgrade the kube-prometheus-stack ───────────
                    # Values are passed inline so no extra values file is required.
                    # Grafana is exposed on NodePort 30090
                    # Prometheus is exposed on NodePort 30091
                    helm upgrade --install $HELM_RELEASE \
                        prometheus-community/kube-prometheus-stack \
                        --namespace $MONITORING_NS \
                        --set grafana.service.type=NodePort \
                        --set grafana.service.nodePort=$GRAFANA_PORT \
                        --set prometheus.service.type=NodePort \
                        --set prometheus.service.nodePort=$PROMETHEUS_PORT \
                        --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
                        --set grafana.adminPassword=admin \
                        --wait \
                        --timeout 5m

                    # ── 4. Confirm Helm release is deployed ───────────────────────
                    helm status $HELM_RELEASE -n $MONITORING_NS

                    # ── 5. Wait for Grafana pod to be Running ─────────────────────
                    echo "=== Waiting for Grafana pod ==="
                    kubectl rollout status deployment/${HELM_RELEASE}-grafana \
                        -n $MONITORING_NS --timeout=180s

                    # ── 6. Wait for Prometheus pod to be Running ──────────────────
                    echo "=== Waiting for Prometheus ==="
                    kubectl rollout status statefulset/prometheus-${HELM_RELEASE}-kube-prometheus-prometheus \
                        -n $MONITORING_NS --timeout=180s

                    echo "=== Monitoring pods status ==="
                    kubectl get pods -n $MONITORING_NS
                '''
            }
        }

        // ─────────────────────────────────────────────
        // Stage 6 – Expose All Services
        // ─────────────────────────────────────────────
        stage('Expose Services') {
            steps {
                sh """
                    set -e

                    # ── App service ───────────────────────────────────────────────
                    echo '=== Exposing Application on NodePort ${APP_PORT} ==='
                    kubectl patch svc notes-webapp-svc --type=json \
                        -p='[{"op":"replace","path":"/spec/type","value":"NodePort"},{"op":"replace","path":"/spec/ports/0/nodePort","value":${APP_PORT}}]' \
                        2>/dev/null || \
                    kubectl patch svc notes-webapp-svc --type=merge \
                        -p '{"spec":{"type":"NodePort","ports":[{"port":3000,"targetPort":3000,"nodePort":${APP_PORT}}]}}'

                    # ── Grafana – discover service name then patch ─────────────────
                    GRAFANA_SVC=\$(kubectl get svc -n ${MONITORING_NS} \
                        -l "app.kubernetes.io/name=grafana" \
                        -o jsonpath='{.items[0].metadata.name}')
                    echo "Grafana service: \$GRAFANA_SVC"

                    CURRENT_GRAFANA_TYPE=\$(kubectl get svc "\$GRAFANA_SVC" -n ${MONITORING_NS} \
                        -o jsonpath='{.spec.type}')

                    if [ "\$CURRENT_GRAFANA_TYPE" != "NodePort" ]; then
                        echo '=== Patching Grafana service to NodePort ${GRAFANA_PORT} ==='
                        kubectl patch svc "\$GRAFANA_SVC" -n ${MONITORING_NS} --type=merge \
                            -p '{"spec":{"type":"NodePort","ports":[{"port":80,"targetPort":3000,"nodePort":${GRAFANA_PORT}}]}}'
                    else
                        echo '=== Grafana already NodePort – verifying port ==='
                        kubectl patch svc "\$GRAFANA_SVC" -n ${MONITORING_NS} --type=json \
                            -p='[{"op":"replace","path":"/spec/ports/0/nodePort","value":${GRAFANA_PORT}}]' \
                            2>/dev/null || true
                    fi

                    # ── Prometheus – discover service name then patch ──────────────
                    PROM_SVC=\$(kubectl get svc -n ${MONITORING_NS} \
                        -l "app=kube-prometheus-stack-prometheus" \
                        -o jsonpath='{.items[0].metadata.name}')
                    echo "Prometheus service: \$PROM_SVC"

                    CURRENT_PROM_TYPE=\$(kubectl get svc "\$PROM_SVC" -n ${MONITORING_NS} \
                        -o jsonpath='{.spec.type}')

                    if [ "\$CURRENT_PROM_TYPE" != "NodePort" ]; then
                        echo '=== Patching Prometheus service to NodePort ${PROMETHEUS_PORT} ==='
                        kubectl patch svc "\$PROM_SVC" -n ${MONITORING_NS} --type=merge \
                            -p '{"spec":{"type":"NodePort","ports":[{"port":9090,"targetPort":9090,"nodePort":${PROMETHEUS_PORT}}]}}'
                    else
                        echo '=== Prometheus already NodePort – verifying port ==='
                        kubectl patch svc "\$PROM_SVC" -n ${MONITORING_NS} --type=json \
                            -p='[{"op":"replace","path":"/spec/ports/0/nodePort","value":${PROMETHEUS_PORT}}]' \
                            2>/dev/null || true
                    fi

                    echo ''
                    echo '=== ALL SERVICES ==='
                    kubectl get svc -A
                """
            }
        }
    }

    // ─────────────────────────────────────────────────
    // Post actions
    // ─────────────────────────────────────────────────
    post {
        success {
            sh """
                NODE_IP=\$(kubectl get nodes \
                    -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}' \
                    2>/dev/null || true)
                if [ -z "\$NODE_IP" ]; then
                    NODE_IP=\$(kubectl get nodes \
                        -o jsonpath='{.items[0].status.addresses[0].address}')
                fi
                echo ''
                echo '════════════════════════════════════════'
                echo '  PIPELINE SUCCESS'
                echo '════════════════════════════════════════'
                echo "  APP        -> http://\${NODE_IP}:30080"
                echo "  GRAFANA    -> http://\${NODE_IP}:30090  (admin / admin)"
                echo "  PROMETHEUS -> http://\${NODE_IP}:30091"
                echo '════════════════════════════════════════'
            """
        }

        failure {
            echo "PIPELINE FAILED - check the stage logs above"
        }
    }
}
