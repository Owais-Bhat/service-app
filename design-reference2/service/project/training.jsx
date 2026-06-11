/* My Training Courses + course player. window.TrainingCourses */
(function () {
  const { useState } = React;
  const I = (p) => React.createElement(window.Icon, p);

  function CourseCard({ c, i, onOpen }) {
    const pct = c.lessons ? Math.round((c.done / c.lessons) * 100) : (c.completed ? 100 : 0);
    return React.createElement('div', { className: 'glass course in', style: { '--d': (0.06 + i * 0.05) + 's' }, onClick: () => onOpen(c) },
      React.createElement('div', { className: 'course-banner ' + c.theme },
        React.createElement('div', { className: 'pat' }),
        React.createElement('div', { className: 'bico' }, I({ name: c.icon, size: 26 })),
        React.createElement('span', { className: 'cat' }, c.category)),
      React.createElement('div', { className: 'course-body' },
        React.createElement('h4', null, c.title),
        React.createElement('p', null, c.desc),
        React.createElement('div', { className: 'course-meta' },
          React.createElement('span', null, I({ name: 'book', size: 14 }), c.lessons + ' lessons'),
          c.quiz ? React.createElement('span', null, I({ name: 'check', size: 14 }), c.quiz + ' quiz') : null,
          c.due ? React.createElement('span', { style: { color: 'var(--amber)' } }, I({ name: 'calendar', size: 14 }), 'Due ' + c.due) : null)),
      React.createElement('div', { className: 'course-foot' },
        React.createElement(window.ProgressRing, { value: pct, size: 48, stroke: 5, color: c.completed ? 'var(--accent)' : 'var(--accent)' }),
        React.createElement('div', { className: 'prog-text' },
          React.createElement('div', { className: 'top' },
            React.createElement('span', null, c.completed ? 'Completed' : (pct > 0 ? 'In progress' : 'Not started')),
            React.createElement('span', null, c.done + '/' + c.lessons)),
          React.createElement('div', { className: 'bar' }, React.createElement('i', { style: { width: pct + '%' } }))),
        React.createElement('div', { className: 'icon-btn', style: { background: 'var(--accent)', color: '#fff' } }, I({ name: c.completed ? 'eye' : 'play', size: 17 })),
      ),
    );
  }

  function TrainingCourses() {
    const D = window.DATA;
    const [open, setOpen] = useState(null);
    const courses = D.courses;
    const assigned = courses.length;
    const completed = courses.filter((c) => c.completed).length;
    const avg = Math.round(courses.reduce((s, c) => s + (c.lessons ? (c.done / c.lessons) * 100 : 0), 0) / courses.length);

    return React.createElement('div', { className: 'stack' },
      // stat strip
      React.createElement('div', { className: 'grid', style: { gridTemplateColumns: 'repeat(3, 1fr)' } },
        [['shield', assigned, 'Courses assigned', 'var(--accent)'], ['award', completed, 'Completed', 'var(--violet)'], ['target', avg + '%', 'Average progress', 'var(--amber)']]
          .map(([ic, val, lbl, c], i) => React.createElement('div', { key: i, className: 'glass kpi in', style: { '--d': (i * 0.05) + 's' } },
            React.createElement('div', { className: 'lrow-ico', style: { width: 52, height: 52, background: 'color-mix(in srgb, ' + c + ' 14%, transparent)', color: c, borderRadius: 16 } }, I({ name: ic, size: 24 })),
            React.createElement('div', { className: 'kpi-info' },
              React.createElement('div', { className: 'kpi-value', style: { fontSize: '1.7rem' } }, val),
              React.createElement('div', { className: 'kpi-label', style: { marginTop: 2 } }, lbl)))),
      ),
      // course grid
      React.createElement('div', { className: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' } },
        courses.map((c, i) => React.createElement(CourseCard, { key: c.id, c, i, onOpen: setOpen })),
      ),
      open && React.createElement(CoursePlayer, { course: open, onClose: () => setOpen(null) }),
    );
  }

  // ---------------- COURSE PLAYER MODAL ----------------
  function CoursePlayer({ course, onClose }) {
    const D = window.DATA.courseDetail;
    const [lessons, setLessons] = useState(D.lessons.map((l) => ({ ...l, done: course.completed ? true : l.done })));
    const [openLesson, setOpenLesson] = useState(lessons.findIndex((l) => !l.done) >= 0 ? lessons.findIndex((l) => !l.done) : 0);
    const [answers, setAnswers] = useState({});
    const [result, setResult] = useState(course.completed ? { passed: true, score: 100 } : null);

    const doneCount = lessons.filter((l) => l.done).length;
    const pct = Math.round((doneCount / lessons.length) * 100);
    const allDone = doneCount === lessons.length;

    const markDone = (idx) => setLessons((ls) => ls.map((l, i) => i === idx ? { ...l, done: true } : l));

    const submitQuiz = () => {
      let correct = 0;
      D.quiz.forEach((q, i) => { if (answers[i] === q.correct) correct++; });
      const score = Math.round((correct / D.quiz.length) * 100);
      setResult({ passed: score >= 70, score });
    };

    const typeIcon = { video: 'play', image: 'eye', pdf: 'receipt', text: 'clipboard' };

    return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target.classList.contains('modal-overlay')) onClose(); } },
      React.createElement('div', { className: 'modal', style: { maxWidth: 780 } },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('div', { className: 'logo-mark', style: { width: 38, height: 38 } }, I({ name: course.icon, size: 20 })),
          React.createElement('h3', null, course.title),
          React.createElement('button', { className: 'icon-btn close', onClick: onClose }, I({ name: 'close' }))),
        React.createElement('div', { className: 'modal-body' },
          // hero
          React.createElement('div', { className: 'player-hero' },
            React.createElement(window.ProgressRing, { value: result?.passed ? 100 : pct, size: 76, stroke: 8, color: result?.passed ? 'var(--accent)' : 'var(--accent)' }),
            React.createElement('div', { className: 'h-info' },
              React.createElement('h4', null, course.desc),
              React.createElement('div', { className: 'h-meta' }, doneCount + '/' + lessons.length + ' lessons done · ' + D.quiz.length + ' quiz questions')),
          ),
          // lessons
          React.createElement('div', { className: 'section-h' }, I({ name: 'book' }), 'Lessons'),
          lessons.map((l, i) => React.createElement('div', { key: l.id, className: 'lesson' + (l.done ? ' done' : '') + (openLesson === i ? ' open' : '') },
            React.createElement('div', { className: 'lesson-head', onClick: () => setOpenLesson(openLesson === i ? -1 : i) },
              React.createElement('div', { className: 'lesson-step' + (l.done ? ' done' : '') }, l.done ? I({ name: 'check', size: 16 }) : (i + 1)),
              React.createElement('div', { className: 't' },
                React.createElement('b', null, l.title),
                React.createElement('small', null, l.done ? '✓ Completed' : (l.type.charAt(0).toUpperCase() + l.type.slice(1) + ' lesson'))),
              React.createElement('span', { className: 'lesson-caret' }, I({ name: 'arrowRight', size: 18 }))),
            openLesson === i && React.createElement('div', { className: 'lesson-body' },
              React.createElement('div', { className: 'lesson-text' }, l.text),
              React.createElement('div', { className: 'lesson-media' }, I({ name: typeIcon[l.type], size: 40 })),
              !l.done && React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => markDone(i) }, I({ name: 'check', size: 16 }), 'Mark complete')),
          )),
          // quiz
          React.createElement('div', { className: 'section-h' }, I({ name: 'check' }), 'Quiz ', React.createElement('span', { style: { color: 'var(--text-3)', fontWeight: 400, fontSize: '0.82rem' } }, '(pass ≥ 70%)')),
          result?.passed && React.createElement('div', { className: 'banner-pass', style: { marginBottom: 14 } }, I({ name: 'award' }), 'Passed — score ' + result.score + '%'),
          D.quiz.map((q, qi) => React.createElement('div', { key: qi, className: 'quiz-q' },
            React.createElement('b', null, (qi + 1) + '. ' + q.q),
            q.opts.map((o, oi) => React.createElement('div', {
              key: oi, className: 'quiz-opt' + (answers[qi] === oi ? ' sel' : ''),
              onClick: () => !result?.passed && setAnswers((a) => ({ ...a, [qi]: oi })),
            },
              React.createElement('span', { className: 'tick' }), o)),
          )),
          !result?.passed && React.createElement('button', { className: 'btn btn-primary', style: { width: '100%', marginTop: 6 }, onClick: submitQuiz }, I({ name: 'check' }), 'Submit quiz'),
          result && !result.passed && React.createElement('div', { style: { textAlign: 'center', marginTop: 14, color: 'var(--rose)', fontWeight: 700, fontSize: '0.88rem' } },
            'Score ' + result.score + '% — you need 70% to pass. Review the lessons and retry.'),
        ),
      ),
    );
  }

  window.TrainingCourses = TrainingCourses;
})();
