/**
 * 모달 팝업 제어 로직
 */

/**
 * 모달 배경(Backdrop) 클릭 시 닫기
 */
function closeModalOnBackdrop(e, id) {
  if (e.target.id === id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('active');
    }
  }
}
