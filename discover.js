const usersEl = document.getElementById("activeUsers");
const yearEl = document.getElementById("year");

let target = 450000;
let current = 0;

function animate(){
    current += Math.ceil((target - current) / 15);
    usersEl.textContent = current.toLocaleString();
    if(current < target){
        requestAnimationFrame(animate);
    }
}

animate();
yearEl.textContent = new Date().getFullYear();


// animated triangle shards
const bg = document.getElementById("bgParticles");
if (bg) {
    const count = 28;
    const types = ["t1","t2","t3"];
    for (let i=0; i<count; i++){
        const d = document.createElement("div");
        d.className = "tri " + types[Math.floor(Math.random()*types.length)];
        d.style.left = (Math.random()*100) + "vw";
        d.style.top = (Math.random()*120) + "vh";
        const dur = 22 + Math.random()*26;
        d.style.animationDuration = dur + "s";
        d.style.animationDelay = (-Math.random()*dur) + "s";
        bg.appendChild(d);
    }
}
