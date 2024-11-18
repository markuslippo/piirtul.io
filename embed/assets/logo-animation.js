async function animateLogo() {
    const response = await fetch('/assets/images/piirtul-io.svg');
    const svgContent = await response.text();
    document.getElementById('logo-container').innerHTML = svgContent;

    const paths = document.querySelectorAll('#piirtul-logo path, #piirtul-logo ellipse');
    const duration = 1;

    for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const elementDuration = parseFloat(path.dataset.duration) || duration;

        if (path.tagName === 'ellipse') {
            await new Promise(resolve => setTimeout(resolve, elementDuration * 100));
            path.style.fill = '#FFFFFF'; 
            await new Promise(resolve => setTimeout(resolve, 100));
        } else {
            let length = path.getTotalLength();
            path.style.strokeDasharray = length;
            path.style.strokeDashoffset = length;
            path.style.stroke = '#FFFFFF'

            await path.animate([
                { strokeDashoffset: length },
                { strokeDashoffset: 0 }
            ], {
                duration: elementDuration * 300,
                fill: 'forwards',
                easing: 'ease-out'
            }).finished; 
        }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
    document.querySelector('.centerized').style.opacity = 1;

    document.getElementById('logo-container').style.marginTop = '0'; 
    document.querySelector('.room-form').style.opacity = 1; 
    //document.getElementById('demo2-content').style.opacity = 1;
}

window.addEventListener('load', animateLogo);