document.addEventListener("DOMContentLoaded", () => {
    const hiddenElements = document.querySelectorAll('.hidden');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15
    });

    hiddenElements.forEach((el) => observer.observe(el));

    const contactForm = document.querySelector('#contact-form');
    const formStatus = document.querySelector('#form-status');

    if (contactForm && formStatus) {
        const submitButton = contactForm.querySelector('.submit-btn');

        contactForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!contactForm.checkValidity()) {
                contactForm.reportValidity();
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'Sending...';
            contactForm.setAttribute('aria-busy', 'true');
            formStatus.className = 'form-status';
            formStatus.textContent = 'Sending your message...';

            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: new FormData(contactForm),
                    headers: {
                        Accept: 'application/json'
                    }
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok || result.success === false) {
                    throw new Error(result.message || 'The message could not be sent.');
                }

                contactForm.reset();
                formStatus.className = 'form-status success';
                formStatus.textContent = 'Thanks! Your message has been sent successfully.';
            } catch (error) {
                formStatus.className = 'form-status error';
                formStatus.textContent = 'Sorry, your message could not be sent. Please try again.';
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Send Message';
                contactForm.removeAttribute('aria-busy');
            }
        });
    }
});
