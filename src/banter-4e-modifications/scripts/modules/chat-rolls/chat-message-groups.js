/** Consecutive visible messages share a header only when their speakers match. */
export class ChatMessageGroups {
  static observer;

  /** Actor identity takes precedence over the user operating that actor. */
  static speakerKey(message) {
    const speaker = message.speaker ?? {};
    return JSON.stringify([speaker.actor || '', speaker.actor ? '' : speaker.scene || '',
      speaker.actor ? '' : speaker.token || '', speaker.alias || '',
      speaker.actor || speaker.token ? '' : message.author?.id || message.user?.id || '']);
  }

  /** Mark even ordinary messages, so they interrupt runs of compact cards. */
  static render(message, root) {
    if (!root?.dataset) {
      return;
    }
    root.dataset.banterSpeaker = ChatMessageGroups.speakerKey(message);
  }

  /** Use actual displayed neighbours, including after deletion or history loading. */
  static refresh(root = document) {
    for (const message of root.querySelectorAll('.chat-message.message[data-banter-speaker]')) {
      const previous = message.previousElementSibling;
      const continuation = previous?.matches('.chat-message.message[data-banter-speaker]')
        && previous.dataset.banterSpeaker === message.dataset.banterSpeaker;
      message.classList.toggle('banter-message-continuation', Boolean(continuation));
    }
  }

  /** Render hooks precede insertion; watch insertion/removal rather than hook order. */
  static install() {
    if (ChatMessageGroups.observer) {
      return;
    }
    ChatMessageGroups.observer = new MutationObserver(records => {
      const messagesChanged = records.some(record => [...record.addedNodes, ...record.removedNodes]
        .some(node => node.nodeType === 1 && (node.matches('.chat-message.message')
          || node.querySelector('.chat-message.message'))));
      if (messagesChanged) {
        ChatMessageGroups.refresh();
      }
    });
    ChatMessageGroups.observer.observe(document.body, { childList: true, subtree: true });
    ChatMessageGroups.refresh();
  }
}
