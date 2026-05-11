const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('.ts')) results.push(file);
  });
  return results;
}

const files = walk('d:/WorkSpace/Quizz-Realtime/backend/src/admin');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let changed = false;
  if (content.includes("from '../../prisma")) {
    content = content.replace(/from '\.\.\/\.\.\/prisma/g, "from '../../../prisma");
    changed = true;
  }
  if (content.includes("from '../../common")) {
    content = content.replace(/from '\.\.\/\.\.\/common/g, "from '../../../common");
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(f, content);
  }
});
