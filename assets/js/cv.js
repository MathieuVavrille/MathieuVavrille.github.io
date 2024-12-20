document.addEventListener("DOMContentLoaded", function () {
    const toggles = document.querySelectorAll(".cv-toggle");

    toggles.forEach((toggle) => {
        toggle.addEventListener("click", () => {
	    console.log("test");
            const section = toggle.parentElement;
            const details = section.querySelector(".cv-details");
            // Toggle the active state
            section.classList.toggle("active");
	    console.log(details.scrollHeight);

            if (section.classList.contains("active")) {
                // Collapse: Transition to max-height 0
                details.style.maxHeight = details.scrollHeight + "px";
            } else {
                // Expand: Dynamically calculate scrollHeight
                details.style.maxHeight = "0";
            }

        });

        // Ensure proper collapsing on page load
        const details = toggle.parentElement.querySelector(".cv-details");
        details.style.maxHeight = "0";

    });
});
