//
// The capture stage is kept above the app and not clipped, so html2canvas can
// measure and render the complete invoice area without other layers masking it.
// The capture wrapper must stay full-size; do not hide it by clipping.
async function renderBillToPdfBlob(billHTML, filename) {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:794px',
    'min-height:1123px',
    'background:#ffffff',
    'pointer-events:none',
    'z-index:2147483647',
  ].join(';');

  const sandbox = document.createElement('div');
  sandbox.style.cssText = 'width:794px;min-height:1123px;background:#ffffff;padding:0;box-sizing:border-box;';
  sandbox.innerHTML = billHTML;
  wrapper.appendChild(sandbox);
  document.body.appendChild(wrapper);

  // Wait two animation frames + an extra tick so layout + fonts + images settle.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise(r => setTimeout(r, 50));

  // Wait for any <img> tags inside the bill to finish loading so they don't
  // render as empty boxes in the PDF.
  const imgs = [...sandbox.querySelectorAll('img')];
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      // Failsafe in case the image never resolves.
      setTimeout(resolve, 2500);
    });
  }));

  try {
    const html2pdf = await loadHtml2Pdf();
    const node = sandbox.firstElementChild;
    node.classList.add('pdf-rendering');
    node.style.width = '794px';
    node.style.maxWidth = '794px';
    node.style.minHeight = '1123px';

    const blob = await html2pdf().set({
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
        width: 794,
        height: sandbox.offsetHeight,
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait', hotfixes: ['px_scaling'] },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(sandbox).outputPdf('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    return { blob, file };
  } finally {
    wrapper.remove();
  }
}
