(function () {
  const root = document.getElementById('comments');
  if (!root) return;

  const page = root.dataset.page;
  const sitekey = root.dataset.sitekey;
  const list = root.querySelector('.comments__list');
  const status = root.querySelector('.comments__status');
  const form = root.querySelector('.comments__form');
  const formStatus = root.querySelector('.comments__form-status');
  const captchaEl = root.querySelector('.comments__captcha');
  const submit = form.querySelector('.comments__submit');
  const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  let widgetId = null;
  let captchaRequested = false;

  function renderComments(comments) {
    list.replaceChildren();
    status.textContent = comments.length ? '' : 'No comments yet. Be the first!';
    status.hidden = comments.length > 0;

    for (const comment of comments) {
      const item = document.createElement('li');
      item.className = 'comments__item';

      const meta = document.createElement('div');
      meta.className = 'comments__meta';
      const name = document.createElement('span');
      name.className = 'comments__name';
      name.textContent = comment.name;
      const time = document.createElement('time');
      time.className = 'comments__date';
      time.dateTime = comment.created_at;
      time.textContent = dateFormat.format(new Date(comment.created_at));
      meta.append(name, time);

      const message = document.createElement('p');
      message.className = 'comments__message';
      message.textContent = comment.message;

      item.append(meta, message);
      list.append(item);
    }
  }

  async function loadComments() {
    try {
      const res = await fetch('/api/comments?page=' + encodeURIComponent(page));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderComments(data.comments || []);
    } catch (err) {
      status.hidden = false;
      status.textContent = "Comments couldn't be loaded right now.";
    }
  }

  // reCAPTCHA is only loaded once the form is near the screen, so readers who
  // never scroll down don't download Google's script.
  function loadCaptcha() {
    if (captchaRequested) return;
    captchaRequested = true;
    window.beaconCommentsCaptcha = function () {
      widgetId = window.grecaptcha.render(captchaEl, { sitekey: sitekey, theme: 'dark' });
    };
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?onload=beaconCommentsCaptcha&render=explicit';
    script.async = true;
    document.head.append(script);
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        observer.disconnect();
        loadCaptcha();
      }
    }, { rootMargin: '400px' });
    observer.observe(form);
  } else {
    loadCaptcha();
  }
  form.addEventListener('focusin', loadCaptcha);

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const name = form.elements.name.value.trim();
    const message = form.elements.message.value.trim();
    if (!name || !message) {
      formStatus.textContent = 'Please fill in your name and a comment.';
      return;
    }

    const token = widgetId !== null ? window.grecaptcha.getResponse(widgetId) : '';
    if (!token) {
      formStatus.textContent = 'Please tick "I\'m not a robot" first.';
      return;
    }

    submit.disabled = true;
    formStatus.textContent = 'Posting…';
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: page,
          name: name,
          message: message,
          website: form.elements.website.value,
          token: token,
        }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (res.ok) {
        form.reset();
        formStatus.textContent = "Thanks! Your comment will appear once it's been approved.";
      } else {
        formStatus.textContent = data.error || 'Something went wrong. Please try again.';
      }
    } catch (err) {
      formStatus.textContent = "Couldn't send your comment. Please check your connection and try again.";
    } finally {
      submit.disabled = false;
      // Each reCAPTCHA token can only be used once.
      if (widgetId !== null) window.grecaptcha.reset(widgetId);
    }
  });

  loadComments();
})();
