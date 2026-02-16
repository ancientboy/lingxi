# 任务管理技能

智能待办事项管理，自动安排日程，微信提醒。

## 功能

- ✅ 添加/查看/完成/删除任务
- ✅ 智能安排日程（避免冲突）
- ✅ 微信提醒（通过 Server酱）
- ✅ Heartbeat 自动检查
- ✅ **重复任务**（每天/每周/每月）
- ✅ **超期提醒**（任务过期自动提醒）
- ✅ **标签分类**（工作/生活/学习等）
- ✅ 和 Supermemory 打通（长期记忆）

## 使用

```javascript
import tasks from './skills/tasks/index.mjs';

// 添加普通任务
await tasks.add('开会', { 
  time: '2026-02-15 15:00',
  duration: 60,
  priority: 'high'
});

// 添加重复任务（每天晨会）
await tasks.add('晨会', {
  time: '2026-02-15 09:00',
  repeat: 'daily',
  tags: ['工作']
});

// 添加标签任务
await tasks.add('健身', {
  time: '2026-02-15 18:00',
  tags: ['生活', '健康']
});

// 查看某天日程
tasks.day('2026-02-15');

// 按标签分类查看
tasks.byTag();

// 查看某类任务
tasks.list({ tag: '工作' });

// 智能安排（自动找空闲时间）
await tasks.schedule('写报告', { duration: 120 });

// 完成任务（重复任务会自动创建下一个）
tasks.complete(taskId);
```

## 提醒配置

- 使用 Server酱 推送到微信
- Heartbeat 每次检查：
  - 30 分钟内的任务 → 即将到期提醒
  - 已过期的任务 → 超期提醒

## API

| 方法 | 说明 |
|------|------|
| add(title, options) | 添加任务（支持 repeat, tags）|
| list(filter) | 查看任务（支持 tag 过滤）|
| day(date) | 查看某天日程 |
| **byTag()** | **按标签分类查看** |
| complete(id) | 完成任务（重复任务自动创建下一个）|
| remove(id) | 删除任务 |
| schedule(title, options) | 智能安排 |
| checkUpcoming(minutes) | 检查即将到期 |
| **checkOverdue()** | **检查超期任务** |
| checkAndAlert() | 检查并发送提醒 |
| sendAlert(task) | 发送微信提醒 |

## 重复任务

支持三种重复：
- `daily` - 每天
- `weekly` - 每周
- `monthly` - 每月

完成任务后自动创建下一个周期的任务。

## 标签

任意字符串，如：`['工作']`, `['生活']`, `['学习']`, `['健康']`
