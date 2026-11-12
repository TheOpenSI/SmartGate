// Rotates the three wildlife pictures on the dashboard every 3 seconds
const imageSets = [
    ["/static/images/red-ruffed-lemur.jpg", "/static/images/bongo-antelope.jpg", "/static/images/red-panda.jpg"],
    ["/static/images/oranguton.jpg", "/static/images/wild_fox.jpg", "/static/images/rihno.jpg"],
    ["/static/images/panda.jpg", "/static/images/wild_fox.jpg", "/static/images/amur-leopard.jpg"]
];

let currentSetIndex = 0;
const images = [
    document.getElementById("image1"),
    document.getElementById("image2"),
    document.getElementById("image3")
];

function changeImages() {
    // Apply fade-out effect
    images.forEach(image => image.classList.add("fade-out"));

    setTimeout(() => {
        currentSetIndex = (currentSetIndex + 1) % imageSets.length;

        images.forEach((image, i) => {
            image.src = imageSets[currentSetIndex][i];
            // Apply fade-in effect after changing images
            image.classList.remove("fade-out");
        });
    }, 500); // Matches animation duration
}

setInterval(changeImages, 3000);
