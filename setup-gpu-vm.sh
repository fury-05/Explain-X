#!/bin/bash
# ============================================================
# ExplainX — One-time GPU VM setup
# Run this ONCE on a fresh Azure NC16as_T4_v3 (Ubuntu 24.04)
# After this, every deploy is just: docker compose -f docker-compose.gpu.yml up --build -d
# ============================================================
set -e

echo ""
echo "============================================================"
echo " Step 1: Install NVIDIA GPU driver via Azure VM Extension"
echo "============================================================"
echo ""
echo "  This step must run from your LOCAL machine (where Azure CLI is logged in),"
echo "  NOT from inside the VM SSH session."
echo ""
echo "  Run this command on your local machine:"
echo ""
echo "    az vm extension set \\"
echo "      --resource-group explainx-rg \\"
echo "      --vm-name explainx-vm \\"
echo "      --name NvidiaGpuDriverLinux \\"
echo "      --publisher Microsoft.HpcCompute \\"
echo "      --version 1.9"
echo ""
echo "  Then wait 5-10 minutes for the driver to install, and re-SSH into the VM."
echo "  When ready, re-run this script to continue from Step 2."
echo ""

# Verify driver is present before continuing
if ! command -v nvidia-smi &> /dev/null; then
    echo "ERROR: nvidia-smi not found. Run the az vm extension command above first."
    echo "       The driver installation takes 5-10 minutes after the extension command."
    exit 1
fi

echo "GPU driver found:"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
echo ""

echo "============================================================"
echo " Step 2: Install nvidia-container-toolkit (Ubuntu 24.04)"
echo "============================================================"
# Ubuntu 24.04 uses the new NVIDIA apt repo (different from 22.04 path)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

echo ""
echo "Configuring Docker to use nvidia runtime..."
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

echo ""
echo "============================================================"
echo " Step 3: Verify Docker can access the GPU"
echo "============================================================"
docker run --rm --gpus all nvidia/cuda:12.1.1-base-ubuntu22.04 nvidia-smi
echo ""

echo "============================================================"
echo " Step 4: Install Docker Compose plugin (if not present)"
echo "============================================================"
if ! docker compose version &> /dev/null; then
    sudo apt-get install -y docker-compose-plugin
fi
docker compose version
echo ""

echo "============================================================"
echo " All done! Host GPU setup complete."
echo ""
echo " To deploy ExplainX with GPU:"
echo "   git clone <your-repo-url>"
echo "   cd sahil-project"
echo "   docker compose -f docker-compose.gpu.yml up --build -d"
echo ""
echo " To verify GPU is actually being used after deploy:"
echo "   docker compose -f docker-compose.gpu.yml logs backend | grep -i cuda"
echo ""
echo " To deallocate the VM when not in use (saves cost):"
echo "   az vm deallocate --resource-group explainx-rg --name explainx-vm"
echo "============================================================"
