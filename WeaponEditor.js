
class WeaponEditor {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2c3e50);
        this.scene.fog = new THREE.Fog(0x2c3e50, 10, 50);

        // Grid
        const gridHelper = new THREE.GridHelper(10, 10);
        this.scene.add(gridHelper);
        const axesHelper = new THREE.AxesHelper(1);
        this.scene.add(axesHelper);

        // Camera
        this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 100);
        this.camera.position.set(2, 2, 2);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(this.width, this.height);

        // Lights
        const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        this.scene.add(dirLight);

        // Controls
        this.orbit = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.orbit.enableDamping = true;

        this.transformControl = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControl.addEventListener('dragging-changed', (event) => {
            this.orbit.enabled = !event.value;
        });
        this.scene.add(this.transformControl);

        // State
        this.parts = [];
        this.selectedPart = null;
        this.animationId = null;

        // Listen for resize
        window.addEventListener('resize', () => this.resize());
    }

    start() {
        if (!this.animationId) {
            this.animate();
        }
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    resize() {
        if (!this.canvas) return;
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        this.orbit.update();
        this.renderer.render(this.scene, this.camera);
    }

    addPart(type) {
        if (this.parts.length >= 5) {
            alert("Максимум 5 частей!");
            return;
        }

        let geometry;
        if (type === 'box') geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        else if (type === 'sphere') geometry = new THREE.SphereGeometry(0.15, 16, 16);

        const material = new THREE.MeshLambertMaterial({ color: 0xcccccc });
        const mesh = new THREE.Mesh(geometry, material);

        // Random slight offset to not overlap perfectly
        mesh.position.y = 0.5;

        this.scene.add(mesh);
        this.parts.push(mesh);
        this.selectPart(mesh);

        this.updatePartList();
    }

    selectPart(mesh) {
        this.selectedPart = mesh;
        this.transformControl.attach(mesh);
    }

    deleteSelected() {
        if (this.selectedPart) {
            this.transformControl.detach();
            this.scene.remove(this.selectedPart);
            this.parts = this.parts.filter(p => p !== this.selectedPart);
            this.selectedPart = null;
            this.updatePartList();
        }
    }

    setMode(mode) {
        // translate, rotate, scale
        this.transformControl.setMode(mode);
    }

    setSelectedColor(hex) {
        if (this.selectedPart) {
            this.selectedPart.material.color.setHex(parseInt(hex.replace('#', '0x')));
        }
    }

    updatePartList() {
        const listEl = document.getElementById('we-part-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        this.parts.forEach((part, index) => {
            const div = document.createElement('div');
            div.className = 'we-part-item';
            div.style.padding = '5px';
            div.style.margin = '2px';
            div.style.background = (part === this.selectedPart) ? '#e67e22' : '#34495e';
            div.style.cursor = 'pointer';
            div.textContent = `Часть ${index + 1} (${part.geometry.type.replace('Geometry', '')})`;

            div.onclick = () => {
                this.selectPart(part);
                this.updatePartList(); // Refresh highlight
            };

            listEl.appendChild(div);
        });
    }

    saveWeapon(name, damage) {
        if (this.parts.length === 0) {
            alert("Пустое оружие!");
            return;
        }

        const weaponData = {
            name: name,
            damage: parseInt(damage),
            parts: this.parts.map(p => ({
                type: p.geometry.type.includes('Box') ? 'box' : 'sphere',
                position: { x: p.position.x, y: p.position.y, z: p.position.z },
                rotation: { x: p.rotation.x, y: p.rotation.y, z: p.rotation.z }, // Euler
                scale: { x: p.scale.x, y: p.scale.y, z: p.scale.z },
                color: '#' + p.material.color.getHexString()
            }))
        };

        console.log("Saving Weapon:", weaponData);

        // Save to LocalStorage for now (simulation)
        // In real app we might verify list
        const saved = JSON.parse(localStorage.getItem('custom_weapons') || '[]');
        saved.push(weaponData);
        localStorage.setItem('custom_weapons', JSON.stringify(saved));

        alert(`Оружие "${name}" сохранено! (Урон: ${damage})`);
    }
}
