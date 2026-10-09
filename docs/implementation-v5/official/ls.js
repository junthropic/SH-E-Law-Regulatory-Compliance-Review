/**
 * file_name : ls.js
 * summary	 : 
 * history	 : 2018. 09. 17. [#12459] 미사용 소스 정리
 *			   2018. 11. 14. [#12797] 국가법령정보센터 최신법령 내 한시조문 및 위헌조문 검색 결과 확인 요청 -> 서브 메뉴 인덱스 분기에 맞게 변경
 *             2018. 11. 22. [#12855] 부칙 저장 (팝업) 확인 요청 -> 부칙 일련 번호 처리 로직 추가
 *             2018. 11. 29. 2018 국가법령 : lsBodySearch() - 기존 오류 수정
 *             2018. 11. 29. [#12906] 국가법령정보센터 내 본문 제공 방식 확인 요청
 *			   2019. 02. 28. [#13433] 3단비교 화면에서 좌측상단의 버튼들 숨김
 *			   2019. 03. 07. [#13626] 3단비교 팝업 확인
 *			   2019. 03. 07. [#13585] 3단 비교 탭 순서 변경요청
 *             2019. 04. 17. [#14004] 3단비교 관련 수정요청
 *			   2019. 04. 24. [#14008] 목록이동시 화면내검색 레이어 닫힘, IE 환경에서 중복검색시 텍스트 사라짐 현상 수정
 *			   2019. 05. 02. [#15462] 부칙검색개선
 *			   2019. 05. 12. [#15701] 법령 본문 팝업 원문으로 조회할 수 있도록 추가
 *			   2019. 05. 30. [#15750] 법령 본문 확인 시 스크롤바 확인 요청
 *			   2019. 07. 29. [#16158] 입법예고 의견쓰기 페이지 연계
 *			   2019. 08. 01. [#16320] 입법예고 스타일 변경 요청
 *			   2019. 11. 21. [#17838] 현행법령 서비스 개선
 *			   2019. 12. 05. [#18260] 통합검색에서 원문법령 다운로드/인쇄시 한글로 다운로드 되는 경우 확인
 *			   2019. 12. 26. [#18241] 법령 제명 검색 관련 개선요청
 *			   2019. 12. 26. [#18443] 별표표시 안되는 오류 확인
 *			   2020. 03. 05. [#18944] 좌측 트리 자동열림 기본값 설정 변경
 *			   2020. 03. 11. [#19144] 법령캘린더 본문 확인
 *			   2020. 06. 11. [#19985] 영문법령 한글본문 보기 기능 변경
 *			   2020. 08. 06. [#20575] 연혁 별표 확인 요청
 *			   2020. 09. 03. [#20683] 시행일 법령 HTML 재생성 개선
 * 	           2020. 10. 22. [#21169] 조문연혁 저장 기능 추가
 * 			   2021. 04. 01. [#24002] 법령명탭에서 제정 개정문이 표시 되는 오류 확인
 *			   2021. 04. 29. [#24088] 공동부령 목록 표시 처리 변경 요청
 *			   2021. 06. 10. [#24643] 공동부령 조문제목, 내용 목록 색인처리
 *			   2021. 09. 16. [#25453] 한눈에 보는 법령정보 테스트 서버에 적용 요청
 *			   2021. 12. 02. [#26269] 법령 본문 스크립트 오류 확인		
 *			   2021. 12. 09. [#26278] 법령 전체 목록에서 표시 건수를 변경시 본문이 열리는 현상 개선
 *			   2021. 12. 09. [#26393] 한눈보기 개선 사항 처리 요청
 *			   2021. 12. 23. [#25764] 법령 XML서비스 적용
 *			   2022. 02. 24. [#27045] 영문법령 데이터 확인 요청	
 *			   2022. 06. 10. [#29836] 제정·개정문 탭 본문 핀고정 오류
 *			   2022. 06. 23. [#29993] 조문 앞 생활법령 아이콘이 나오지 않는 현상확인
 *			   2022. 06. 23. [#29996] 국세법령정보시스템에서 3단비교 호출 시 오류페이지가 나오는 현상 확인
 *			   2022. 08. 12. [#30472] 영문법령 서비스 목록 변경 요청
 *			   2023. 03. 14. [#32278] 검색어 일치되는 별표 빨간색 처리 개선
 *			   2023. 06. 30. [#32301] 법령정보 검색기능 개선 
 *			   2023. 09. 07. [#33409] 현행법령으로 이동시 탭으로 이동 되도록 수정 요청
 *			   2023. 09. 21. [#33404] 웹 접근성을 위한 alt 및 title 값 추가 및 변경
 *			   2023. 10. 19. [#33560] 상세검색 후 법령 본문 내 별표 검색내용 표시 추가
 *			   2023. 10. 26. [#33675] 한눈보기 조제목 null 표출오류
 *			   2024. 01. 11. [#33980] 3단비교 탭 순서 변경 개선
 *			   2024. 04. 11. [#34351] 문서뷰어를 통한 미리보기 기능 개발
 *			   2024. 05. 09. [#34606] 민법, 상법 좌측 목록에 편만 볼 수 있는 기능 추가 요청
 * 			   2024. 05. 30. [#34803] 시각장애인협회 웹접근성 검토의견 조치
 *             2024. 06. 24. [#34981] 웹 접근성 보완 요청
 *             2024. 09. 26. [#35318] 법령 본문 TTS 기능 추가
 *             2025. 04. 17. [#36138] 전자 점자 서비스 기능 제공
 *             2025. 06. 05. [#36838] [만족도조사 개선사항] 한눈보기 링크 방식 개선
 *             2025. 06. 05. [#36835] [만족도조사 개선사항] 3단비교 탭 순서 변경 요청
 *             2025. 06. 19. [#36836] [만족도조사 개선사항] 한눈보기 조문단위 아이콘을 통한 버튼 제공
 *			   2026. 03. 26. [#40015] 포털사이트에서 접속 했을 때 현행법령 표시 방법 및 링크 변경 요청
 * @author   : seoyeji
 * @date	 : 2018. 9. 17.
 */


// wide -> List 본문 보여줄 때 구분값 true 일 때는 본문을 보여주지않고 wide(목록)상태를 유지시키기 위함
// 검색필터 변경시 본문열림 방지
var nonListGubun = false;
 
var LsValueObj = function() { // 법령정보 Obj
	this.lsValue = {
		lsiSeq : "",
		lsId : "",
		lsNm : "",
		ancYd : "",
		ancNo : "",
		efYd : "",
		efYn : "",
		chrClsCd : "",
		paras : "",
		nwYn : "",
		joNo : "",
		joBrNo : "",
		docCls : "",
		joChgYn : "",
		csq : "",
		dtlSchLsByl : "",
		popLsiSeq : "",
		nwLsIncRvs : "",
		vSct : "",
		efDvPop : "",
		ancDvPop : "",
		nwJoYnInfo : "",
		efGubun : "",
		lsRvsGubun : "",
		joBdyYn : "",
		calDt : "",
		efLsGubun : "",
		joLnkStr : "", // 20170909 추가
		arSeq : "",
		ancYnChk : "", // 2019.08.13 연혁법령(공포,시행여부 구분값 추가)
		netPrivateYn : ""
	};
	this.conValue = {
		popUpYn : "",
		hLsiSeq : "",
		hEfYd : "",
		preChkId : "",
		listDiv : "",
		bdyMode : true,
		bdyLangType : "",
		updateMode : "",
		srchUrl : ""
	};

	this.updateValue = {
		actionUrl : "",
		updateDiv : "",
		updateMode : "",
		updateListMode : ""
	};
	this.bdyUpdValue = {
		actionUrl : "",
		updateDiv : "",
		updateMode : "",
		updateContentNm : ""
	};
	this.LangType = "";
	this.bdyType = "";
	this.csmShowHideCls = true;
	;
	this.comparePrevNo = -1;
	this.lsJoHstPara = "";
	this.msg = "본문 조회 후 사용하세요.";
	this.openPopValue = {
		lsiSeq : "", // 새창으로 정보 obj
		lsEfYn : false, // 시행예정 팝업 여부
		lsEfSeq : "",
		lsJoEfYdSeq : "",
		lsJoRltDpYn : "", // 조문내용 조회 시 본문 url
		popMode : "",
		popCls : ""
	};
	this.bdySchChk = false; // 본문 조회 여부

}

LsValueObj.prototype.bdySchInit = function(refresh) { // 법령 본문 조회 초기화 (기본 한글법령)
	this.bdyUpdValue.actionUrl = "lsInfoR.do";
//	this.bdyUpdValue.actionUrl = "lsInfoR_XML.do";
	this.lsValue.netPrivateYn = el("netPrivateYn").value;
	this.bdyUpdValue.updateDiv = "bodyContent";
	this.bdyUpdValue.updateMode = "lsBdy";
	this.updateValue.updateDiv = "bodyContent";
	this.conValue.bdyMode = true;
	if (!refresh) { // 첫 onReady가 되었을 경우에만 호출하지 않는다. (default=한자)
		$('#langType').find('img').attr('alt', '한자'); // 한자 한글 이미지 초기화
		$('#langType').find('img').attr('src', webRoot + '/images/common/btn_v13fn5_1.png');
	}
}

LsValueObj.prototype.engBdyToggle = function(obj) { // 영문법령 본문 토글 (영문<->한글)
	var $btnTitle = $(obj).text();
	$btnTitle = $btnTitle.substring(1, 3);

	if (!this.bdySchChk) {
		$('#bdyBtnKO').text('(영문)본문');
		return;
	}

	if ($btnTitle == '한글') {
		lsVO.bdyUpdValue.updateContentNm = "lsBdy"; // 저장 인쇄 때문에 추가
		$('#bdyBtnKO').text('(영문)본문');
		$('#bodyContentTOP').css('display', 'block');
		$('#bodySideContent').css('display', 'none');
	} else {
		lsVO.bdyUpdValue.updateContentNm = "engLsInfoR"; // 저장 인쇄 때문에 추가
		$('#bdyBtnKO').text('(한글)본문');
		$('#bodyContentTOP').css('display', 'none');
		$('#bodySideContent').css('display', 'block');
	}

}

/*
 * 법령 본문 조회 시 다른 법령 조회하지 않는 이상
 * 본문 재조회를 하지 않는다.
 */
LsValueObj.prototype.getBdySchChk = function() {
	return this.bdySchChk;
}



LsValueObj.prototype.remove = function() { // 법령정보 초기화
	this.lsValue.lsiSeq = "";
	this.lsValue.lsNm = "";
	this.lsValue.chrClsCd = "";
	this.lsValue.paras = "";
	this.lsValue.joNo = "";
	this.lsValue.joBrNo = "";
	this.lsValue.lsId = "";
	this.lsValue.ancYd = "";
	this.lsValue.ancNo = "";
	this.lsValue.efYd = "";
	this.lsValue.efYn = "";
	this.lsValue.joChgYn = "";
	this.bdyType = "";
	this.csmShowHideCls = true;
	this.lsValue.popLsiSeq = "";
	this.lsValue.nwLsIncRvs = "";
	this.lsValue.efDvPop = "";
	this.lsValue.ancDvPop = "";
	this.lsValue.nwJoYnInfo = "";
	this.lsValue.efGubun = "";
	this.lsValue.lsRvsGubun = "";
	this.lsValue.joBdyYn = "";
	this.lsValue.calDt = "";
	this.lsValue.efLsGubun = "";
	this.lsValue.pg = "";
	this.lsValue.ancYnChk = "";// 2019.08.13 연혁시행/공포값 ancYnChk값 초기화 
	this.lsValue.p11 = "";
	this.lsValue.p12 = "";
	this.lsValue.p15 = "";
	this.lsValue.p18 = "";
	this.lsValue.p19 = "";
}

LsValueObj.prototype.removeConValue = function() { // 법령정보 초기화
	this.conValue.preChkId = "";
}

/** 법령 검색 오브젝트 */
var LsSearchObj = function() {
	this.param = {
		q : "",
		outmax : "50",
		p1 : "",
		p2 : "",
		p3 : "",
		p4 : "",
		p5 : "",
		d1 : "",
		d2 : "",
		d3 : "",
		p7 : "",
		p8 : "",
		p11 : "", // 2019.08.19 연혁법령(공포,시행여부 구분값 추가) --조문내용,조문제목 
		p12 : "", // 2019.08.27 조문제목 원문도 나올수 있도록 처리 
		p15 : "", // 2019.08.19 연혁법령(공포,시행여부 구분값 추가) --법령본문 
		p18 : "", // 2019.08.13 연혁법령(공포,시행여부 구분값 추가) --법령명 
		p19 : "", //공동부령 구분 코드 추가
		pg : "1",
		dsort : "",
		fsort : "",
		csq : "",
		lsType : "",
		idxList : "",
		section : "",
		lsiSeq : "0",
		dtlSchLsNm : "",
		dtlSchLsBdyNm : "",
		efYd : "",
		p13 : "" //공동부령 코드
	};
}

/**
 * <pre>
 * 법령검색초기화
 * </pre>
 * @author brKim
 * @since 2017. 6. 29.
 */
LsSearchObj.prototype.remove = function() {
	this.param.q = "";
	this.param.p1 = "";
	this.param.p2 = "";
	this.param.p4 = "";
	this.param.p5 = "";
	this.param.p6 = "";
	this.param.d1 = "";
	this.param.d2 = "";
	this.param.d3 = "";
	this.param.pg = "1";
	this.param.dsort = "";
	this.param.fsort = "";
	this.param.csq = "";
	this.param.idxList = "";
	this.param.lsType = "";
	this.param.p7 = "";
	this.param.p8 = "";
	this.param.p18 = "";// 2019.08.13 연혁법령(공포,시행여부 구분값 추가) -법령명
	this.param.p15 = "";// 2019.08.19 연혁법령(공포,시행여부 구분값 추가) -법령본문
	this.param.p11 = "";// 2019.08.19 연혁법령(공포,시행여부 구분값 추가) -조문내용,조문제목
	this.param.p12 = "";// 2019.08.27 조문제목 원문도 함께 보여줄수있도록 처리 
	this.param.p19 = "";// 공동부령여부 초기화 - 법령명에서만 사용 할 수 있게
	this.param.lsiSeq = "0";
	this.param.dtlSchLsExWord= ""; //제외어 추가
	this.param.dtlSchLsNm = "";
	this.param.dtlSchLsBdyNm = "";
	this.param.efYd = "";
	this.param.efGubun = "";// 시행여부도 초기화하게 수정
	this.param.p13 = "";// //공동부령 코드
}

/**
 * <pre>
 * .util_cont object 초기화
 * </pre>
 * @author brKim
 * @since 2017. 6. 29.
 */
LsSearchObj.prototype.filterReset = function() {
	this.param.csq = "";
	this.param.p1 = "";
	this.param.p2 = "";
	this.param.p3 = "";
	this.param.p4 = "";
	this.param.p10 = "";
	this.param.p13 = "";
	this.param.fsort = "";
	this.param.psort = "";
};

/**
 * <pre>
 * section값세팅
 * </pre>
 * @author brKim
 * @since 2017. 6. 29.
 * @param menuNm
 * @returns {String}
 */
LsSearchObj.prototype.setSection = function() {

	var menuNm = $('.sub_tab_area .sub_tab li:eq('+(tabMenuIdx-1)+') > a').text();

	if (menuNm == "법령명" || menuNm == "공포법령" || menuNm == "시행법령"
			|| menuNm == "시행예정법령" || menuNm == "폐지법령" || menuNm == "한시법령") {
		lsSearchObj.param.section = "lawNm";
	} else if (menuNm == "조문내용" || menuNm == "한시조문" || menuNm == "위헌조문") {
		lsSearchObj.param.section = "joBody";
	} // else if (menuNm == "법령본문" || menuNm == "부칙" || menuNm == "제정·개정문") {
	else if (menuNm == "법령본문" || menuNm == "제정·개정문") {
		lsSearchObj.param.section = "bdyText";
	} else if (menuNm == "조문제목") {
		lsSearchObj.param.section = "joTtl";
	} else if (menuNm == "부칙") {
		lsSearchObj.param.section = "subArText";
	}

}

/**
 * <pre>
 * 	lsType값 세팅
 * 	=>	lsType 값으로 화면 테이블 구조를 결정한다.
 * 		기존 값으로 세팅만 하게 설정한다.
 *  	직접 입력할 경우 세팅한다.
 *    no   법령종류
 *     5     부칙
 *     6  제정·개정문
 *     7   공포법령
 *     8   시행법령
 *     9  시행예정법령
 *    10   폐지법령
 *    11   한시법령
 *    12   실효법령	<= 현재 사용안하고 있는것 같음
 *    13   한시조문
 *    15   위헌조문
 *   100	그 외
 * </pre>
 * @author brKim
 * @since 2017. 7. 05.
 */
LsSearchObj.prototype.setLsType = function(value) {

	var tempLsType = null;

	if (value) {

		tempLsType = value;

	} else {

		if (subMenuIdx == '5') { // 최신법령일 경우

			switch (parseInt(tabMenuIdx)) {
			case 1: tempLsType = 7; break;
			case 2: tempLsType = 8; break;
			case 3: tempLsType = 9; break;
			case 4: tempLsType = 10; break;
			case 5: tempLsType = 11; break;
			case 6: tempLsType = 13; break;
			case 7: tempLsType = 15; break;
			default : tempLsType = 100; break;
			}

		} else { // 그 외

			switch (parseInt(tabMenuIdx)) {
			case 5: tempLsType = 5; break;
			case 6: tempLsType = 6; break;
			}

		}
	}

	lsSearchObj.param.lsType = tempLsType;
}

/**
 * <pre>
 * 	본문 or 제개정, 3단비교, 신구법 조회
 * </pre>
 * @author brKim
 * @since 2017. 7. 6.
 * @param vo
 */
function fLsUpd(vo) {
	if (vo.conValue.bdyMode) { // 본문 조회용

		vo.conValue.bdyLangType = vo.lsValue.chrClsCd;

		fUpdateFast(vo.bdyUpdValue.updateDiv, vo.bdyUpdValue.actionUrl,
				makeParam(vo.lsValue), vo.bdyUpdValue.updateMode);
	} else { // 제개정, 3단비교, 신구법 등
		fLsUpdate(vo.updateValue.updateDiv, vo.updateValue.actionUrl,
				makeParam(vo.lsValue), vo.updateValue.updateMode);
	}
}

/**
 * <pre>
 * 	버튼 보이기 여부
 * 	=> 본문 이외에는 위임조례, 조례위임조문을 숨긴다.
 * 	history
 * 		2017.10.25. 한영 토글 버튼도 추가
 * </pre>
 * @author brKim
 * @since 2017. 10. 24.
 */
function isBtnView(kind) {

	var btnHide = false;
	switch (kind) {
	case 'lsBdy': btnHide = false; break;
	case 'lsRvsDocInfoR':
	case 'lsPtnThdCmp':
	case 'lumThdCmp':
	case 'lumThdCmpSc':
	case 'thdCmpNew':
	case 'lsOldAndNew': btnHide = true; break;
	}

	// 본문일 경우에만 조문바로가기 버튼을 보여준다.
	eventObj.topBtn.getViewBtn({
		id: 'lsJoMoveDiv'
	   ,dpYnFunc: function() {
			return kind == "lsBdy";
		}
	});

	if (btnHide) {
		$('.body_top_area .l_bx #unOrdinLnkBtn').css('display', 'none');
		$('.body_top_area .l_bx #unOrdinLsLnkBtn').css('display', 'none');

		var langTypeView = 'none';

		if(kind == 'lsRvsDocInfoR' || kind == 'lsPtnThdCmp' || kind == 'lumThdCmp' || kind == 'lumThdCmpSc' || kind == 'thdCmpNew'){
			langTypeView = '';
		}

		$('.body_top_area .r_bx #langType').css('display', langTypeView);
	} else {
		eventObj.topBtn.getViewBtn({
			  id: 'unOrdinLnkBtn'
		     ,dpYnFunc: function() {
				return $("#lumIsConOrdin").val() == "Y";
			}
		}, {
			  id: 'unOrdinLsLnkBtn'
			 ,dpYnFunc: function() {
				return $("#lumIsConOrdin").val() == "Y";
			}
		});
		$('.body_top_area .r_bx #langType').css('display', '');
	}
}

function arView(id, info) {// 부칙 더보기
	var mode = "";
	var obj = el(id);
	
	if (info == null || info == 'undefined'){
		info = "";
	}
	
	if (obj != null) {
		var imgId = el(id + "btn");
		var imgMrId = el(id + "MrBtn");
		if (obj.style.display == "") {
			obj.style.display = "none";
			imgId.src = imgId.src.replace("btn_cocl", "btn_coop");
			imgId.alt = "부칙"+info+"조문목록 펼치기";
			imgMrId.src = imgMrId.src.replace("btn_more_bu.gif",
					"btn_more_all.gif");
			imgMrId.alt = "부칙"+info+"전체보기";
		} else {
			obj.style.display = "";
			imgId.src = imgId.src.replace("btn_coop", "btn_cocl");
			imgId.alt = "부칙"+info+"조문목록 접기";
			imgMrId.src = imgMrId.src.replace("btn_more_all.gif",
					"btn_more_bu.gif");
			imgMrId.alt = "부칙"+info+"조문목록 접기";
		}
	}
}

/**
 * <pre>
 * 법령본문내하단 별표 상세 보기
 * </pre>
 * @author brKim
 * @since 2017. 7. 5.
 * @param bylSeq
 */
function bylInfoDiv(bylSeq) {

	var $bylDiv = $("#byl" + bylSeq);
	var $svBylDiv = $("#svByl" + bylSeq); // 뷰어 적용

	if ($bylDiv.length > 0) {

		var $bylBtnImg = $("#by" + bylSeq + "btn");

		var display = $bylDiv.css('display');

		var chrClsCd = "";

		if ($("#lsBdyChrCls").length > 0) {
			chrClsCd = $("#lsBdyChrCls").val();
		}

		// 이미지 / 뷰어 구분
		if ($svBylDiv.length == 0) {
			if (display == "none") {

				var urlName = 'lsBylContentsInfoR.do';
				var parameter = 'bylSeq=' + bylSeq + '&chrClsCd=' + chrClsCd;

				$bylDiv.load(urlName, parameter, function(response, status, xhr) {
					if (status == 'success') {
						if ($.browser.isIE6) {
							window.onresize = afterHeightResize;
						}
					}
				});

				$bylDiv.css('display', 'block');
				$bylBtnImg.attr('src', $bylBtnImg.attr('src').replace("btn_coop", "btn_cocl"));

			} else {

				$bylDiv.css('display', 'none');
				$bylBtnImg.attr('src', $bylBtnImg.attr('src').replace("btn_cocl", "btn_coop"));

			}
		} else {
			
			var bylFlSeq = $svBylDiv.attr('name');
			var svDisplay = $svBylDiv.css('display');
			
			if (svDisplay == "none") {
				
				var urlName = 'lsBylContentsInfoR.do';
				var parameter = 'bylSeq=' + bylSeq + '&chrClsCd=' + chrClsCd;

				// Viewer load
				$svBylDiv.load(urlName, parameter, function(response, status, xhr) {
					if (status == 'success') {
						if ($.browser.isIE6) {
							window.onresize = afterHeightResize;
						}
					}
				});

				$svBylDiv.css('display', 'block'); // $("#svByl" + bylSeq).css('display', 'block')
				$bylBtnImg.attr('src', $bylBtnImg.attr('src').replace("btn_coop", "btn_cocl"));

			} else {

				$svBylDiv.css('display', 'none');
				$bylBtnImg.attr('src', $bylBtnImg.attr('src').replace("btn_cocl", "btn_coop"));
	
			}
		}
	}

}

function lawInfPop(lsiSeq) { // 새창으로
	var url = "lsInfoP.do?lsiSeq=" + lsiSeq;

	// 조회이력 검색어 셋팅
	var vSct = lsSearchObj.param.q;
	url = url + "&vSct=" + encodeURIComponent(vSct);

	var checkBox;

	try {
		checkBox = el("openPopYn").checked;
	} catch (e) {
		checkBox = false;
	}

	if (checkBox) {

		
		openPop(url, 1040);
		return true;

	} else {
		return false;
	}
}

/**
 * <pre>
 * 	법령목록 오른쪽상단 새창(목록) 체크시 호출되는 함수
 * </pre>
 * @author jhok
 * @since 2019. 8. 17.
 * @param lsiSeq
 * @param efYd
 * @param nwJoYnInfo
 * @param ancYnChk
 * 
 * 2019.08.17
 * 목록에서 왼쪽상단 새창(목록) 띄울시 lsInfoP.do 에 법령seq(lsiSeq), 시행일자(efYd), 현행여부(nwJoYnInfo),
 * 연혁법령 공포/시행여부) ancYnChk , efGuBUN ='Y' 값을 넘겨준다.
 * ancYd,ancNo 값은 기존의 값이므로 빈값을 넘김 
 */
function lawInfPopAnc(lsiSeq, efYd, nwJoYnInfo, ancYnChk) { // 새창으로

	var url = "lsInfoP.do?lsiSeq=" + lsiSeq;

	// 조회이력 검색어 셋팅
	var vSct = lsSearchObj.param.q;
	url = url + "&ancYd=&ancNo=&efYd=" + efYd;
	url = url + "&nwJoYnInfo=" + nwJoYnInfo;
	url = url + "&ancYnChk=" + ancYnChk; // 시행일법령 ancYnChk 값을 파라미터로 넘김
	url = url + "&efGubun=Y";
	url = url + "&vSct=" + encodeURIComponent(vSct);

	var checkBox;

	try {
		checkBox = el("openPopYn").checked;
	} catch (e) {
		checkBox = false;
	}

	if (checkBox) {

		
		openPop(url, 1040);
		return true;

	} else {
		return false;
	}
}


/**
 * <pre>
 * 	법령 본문 팝업 시 호출 (3단비교, 신구법 비교 등 외 호출)
 * </pre>
 * @author brKim
 * @since 2017. 12. 20.
 * @param seq
 * @param ancYd
 * @param ancNo
 * @param efYd
 * @param nwJoYnInfo
 * @param efGubun
 * @param chrClsCd
 * @param ancYnChk  // 시행/공포를 구분하기 위해 추가 
 * 
 * 2019.08.17  lsInfoP 호출 시 ancYnChk 값 ( 시행 = 0, 공포 = 1 ) 에 따라서 법령 본문호출 하기 위해서 파라미터 추가.
 */
function lsPopViewAll2(seq, ancYd, ancNo, efYd, nwJoYnInfo, efGubun, chrClsCd ,ancYnChk, chapNo) {	
	lsViewAll2(seq, ancYd, ancNo, efYd, nwJoYnInfo, efGubun, '0000', '', chrClsCd ,ancYnChk, chapNo);
}

function lsPopViewAllCal(seq, ancYd, ancNo, efYd, nwJoYnInfo, ancYnChk) {
	lsVO.openPopValue.popCls = "lsRvsDocInfoR";
	lsViewAll2(seq, ancYd, ancNo, efYd, nwJoYnInfo, "Y", '0000', '', '', ancYnChk);
}

function lsPopViewAll(seq, efyd) {
	lsViewAll(seq, efyd, '0000');
}
/*HTML 경로 설정을 위해 ancYnChk, efGubun 추가*/
function lsPopViewAll(seq, efyd, chrClsCd, ancYnChk, efGuBun) {
	lsViewAll(seq, efyd, '0000', '', '', '', chrClsCd, ancYnChk, efGuBun);
}

function lsPopViewAllTemp(seq) {
	lsViewAllTemp(seq, '', '0000');
}

var netPrivateYn = $("#netPrivateYn").val();
/**
 * <pre>
 * 	법령 팝업 본문 조회 (새창 체크 후 법령목록 클릭)
 * </pre>
 * @author brKim
 * @since 2017. 7. 6.
 * @param seq
 * @param ancYd
 * @param ancNo
 * @param efYd
 * @param nwJoYnInfo
 * @param efGubun
 * @param checkId
 * @param chk
 * @returns {String}
 * 
 * 2019.08.13  시행일법령 서비스에서 연혁법령 시행/공포 구분위해 ancYnChk 값 추가 
 * 			   법령목록에서 새창체크후 호출하는 함수(lsInfoP)
 * 			   좌측조문목록 불러오기 위해 fSelectJoListAncInfoP 함수호출 
 */
function lsViewAll2(seq, ancYd, ancNo, efYd, nwJoYnInfo, efGubun, checkId, chk, chrClsCd, ancYnChk, chapNo) {

	lsVO.bdySchInit(); // 법령 본문 조회 초기화 세팅

	var nwLsIncRvs = lsVO.lsValue.nwLsIncRvs;

	// 조회이력 검색어 셋팅
	lsVO.lsValue.vSct = lsSearchObj.param.q;

	if (chk != "wide" && $('#openPopYn').is(':checked')) {

		lsVO.lsValue.joChgYn = "";
		lsVO.bdyUpdValue.updateContentNm = lsVO.bdyType;
		lsVO.bdyUpdValue.updateDiv = "bodyContentTOP";

		lsVO.lsValue.lsiSeq = seq;
		lsVO.lsValue.efYd = efYd;
		lsVO.lsValue.efYn = 'Y';
		lsVO.lsValue.nwJoYnInfo = nwJoYnInfo;
		lsVO.lsValue.efGubun = efGubun;
		lsVO.lsValue.chrClsCd = chrClsCd; // 기본 언어 설정
		// 연혁법령 시행/공포 구분위해 ancYnChk 값 추가
		lsVO.lsValue.ancYnChk = ancYnChk;

		if (joCtsTnf()) {
			setPopValue("lsInfoP");
		}

		fPopContent();

		return "";
	}

	lsVO.lsValue.popLsiSeq = seq;
	if(chapNo != undefined && chapNo != ""){
		lsVO.lsValue.chapNo = chapNo;
		$("#SpanArDt").hide();
	}else{
		$("#SpanArDt").show();
	}
	if (seq != lsVO.conValue.hLsiSeq || tabChgChk) {

		tabChgChk = false;
		lsVO.remove();

		if (nwLsIncRvs != null && nwLsIncRvs != "") {
			lsVO.lsValue.nwLsIncRvs = nwLsIncRvs;
		}

		if (!lawInfPop(seq)) {

			/*if (lsVO.LangType == null || lsVO.LangType == "") {
				lsVO.LangType = "010202";
			}*/
			if ("010201" == chrClsCd) {
				lsVO.LangType = "010201";
			} else {
				lsVO.LangType = "010202";
			}

			if (checkId != '0000') {
				eventObj.list.callLsDepth1();
			}

			lsVO.conValue.preChkId = checkId;
			lsVO.conValue.hLsiSeq = seq; // 동일 선택 위한 저장
			lsVO.lsValue.lsiSeq = seq;
			lsVO.conValue.hEfYd = efYd;
			lsVO.lsValue.efYd = efYd;
			lsVO.lsValue.efYn = 'Y';
			lsVO.lsValue.nwJoYnInfo = nwJoYnInfo;
			lsVO.lsValue.efGubun = efGubun;
			lsVO.lsValue.chrClsCd = lsVO.LangType; // 기본 언어 설정
			/* 연혁법령 시행/공포 구분위해 ancYnChk 값 추가 
			   lsVO에 값을 담아서 넘김 값을 담지않으면 추후에 lsInfoP에서 lsInfoR본문 로드시 값이 넘어가지않음. 
			 */
			lsVO.lsValue.ancYnChk = ancYnChk;

			if ($("#ancYnDv").length > 0) {
				lsVO.lsValue.ancYnDv = $("#ancYnDv").val();
			}

			bdyChange(false);

			lsBdyView(lsVO);
			moveCheckLsNm(checkId);

			try {

				el("moreView").style.display = "none"; // 더보기 닫기
				el("div_lsSystem").style.display = "none";
				el('mdaLi').style.display = "none";

			} catch (e) {
				logger.def("법령상세보기 레이어 초기화 중 오류  :::: " + e, 1);
			}
		}
	} else {
		if (!lawInfPop(seq)) {
			if (checkId != '0000') {
				eventObj.list.callLsDepth1(checkId);
			}
			moveCheckLsNm(checkId);
		}
	}
	if (netPrivateYn == 'N') {
		// 쿠키에서 값을 환경설정값을 조회하여 트리를 설정한다.
        var lawTree = getCookie("lawTree") == '' ? false : eval(getCookie("lawTree"));
		if (lawTree) {
        	/* 2019.08.17 
        	 * 좌측 조문목록 불러오는 함수 ancnChk 와 efYd 값을 넘겨서 시행일을 판단한다. 
        	 * 기존에 존재하던 fSelectJoList 함수를 수정. 다른 소스에서 사용여부 확인이 안되어 새로 생성한 함수이므로 추후 영향도 파악이 되면 정리 필요
        	 * 기존의 함수에 ancYnChk(연혁법령 공포/시행여부) 값과 efYd 값을 추가함. 
        	 * */
			// fSelectJoList('SpanJo', '999', '', $("#lsiSeq").val());
			fSelectJoListAncInfoP('SpanJo', '999', '', seq, efYd, '', ancYnChk);
		}
	}
}

/**
 * <pre>
 * 	법령 본문 조회 (최종공포내용)
 * </pre>
 * @author brKim
 * @since 2018. 1. 11.
 * @param seq
 * @param ancYd
 * @param ancNo
 * @param efYd
 * @param efGubun
 */
function lsViewAll3(seq, ancYd, ancNo, efYd, efGubun, ancYnChk) {

	// 법령 검색 초기화 세팅
	lsVO.bdySchInit(true);

	var nwLsIncRvs = lsVO.lsValue.nwLsIncRvs;

	// 조회이력 검색어 셋팅
	lsVO.lsValue.vSct = lsSearchObj.param.q;

	lsVO.lsValue.popLsiSeq = seq;
	if (seq != lsVO.conValue.hLsiSeq || tabChgChk) {
		tabChgChk = false;
		lsVO.remove();

		if (nwLsIncRvs) {
			lsVO.lsValue.nwLsIncRvs = nwLsIncRvs;
		}

		if (!lawInfPop(seq)) {

			if (lsVO.LangType) {
				lsVO.LangType = "010202";
			}

			lsVO.conValue.preChkId = '0000';
			lsVO.conValue.hLsiSeq = seq; // 동일 선택 위한 저장
			lsVO.lsValue.lsiSeq = seq;
			lsVO.conValue.hEfYd = efYd;
			lsVO.lsValue.efYd = efYd;
			lsVO.lsValue.efYn = 'Y';
			lsVO.lsValue.chrClsCd = lsVO.LangType; // 기본 언어 설정
			lsVO.lsValue.ancYnDv = 'Y';// 공포법령구분(더보기>공포법령 호출시)
			lsVO.lsValue.efDvPop = 'Y';
			lsVO.lsValue.efGubun = 'N';
			lsVO.lsValue.ancYnChk = ancYnChk;

			bdyChange(false);

			lsBdyView(lsVO);
			moveCheckLsNm('0000');

			try {
				el("moreView").style.display = "none"; // 더보기 닫기
				el("div_lsSystem").style.display = "none";
				el('mdaLi').style.display = "none";

			} catch (e) {
				logger.def("법령상세보기 레이어 초기화 중 오류  :::: " + e, 1);
			}
		}
	} else {
		if (!lawInfPop(seq)) {
			moveCheckLsNm('0000');
		}
	}
}

/**
 * <pre>
 * 	법령 상세 보기 (WIDE + LIST)
 * </pre>
 * @author brKim
 * @since 2017. 6. 12.
 * @param seq
 * @param efYd
 * @param checkId
 * @param chk
 * @param obj
 * @param nwYn
 * @returns {String}
 * 
 * 2019.08.13 시행일법령 서비스위한 ancYnChk,efGubun 파라미터 추가 
 * 			  연혁법령 시행일 wide 목록에서 클릭시 타는 함수에서 ancYnChk = '0' , efGubun = 'Y'값 넘기는 파라미터 임 
 */
function lsViewAll(seq, efYd, checkId, chk, obj, nwYn, chrClsCd, ancYnChk, efGubun, tabMenu) {
    oneViewLayer.hiddenOneViewLayer();
	lsVO.bdySchInit(); // 법령 본문 조회 초기화 세팅
	// 레이어 초기화
	LsPopLayer.layerCallInit();

	// 화면내 검색 레이어 닫기
	SaveWindow.hideBdySearch();

	firstSearchFlag = true;

	// 현행일 경우 3단비교 보여주고 그 외엔 숨김
	eventObj.topBtn.getViewBtn({
		id: 'thdLsView'
	   ,dpYnFunc: function() {
			return nwYn == 3;
		}
	});

	
	/* 2019.08.17 
	 * 법령 목록에서 클릭 시  파라미터로 nwJoYnInfo 값을 넘기는데 파라미터로는 넘어오지 않는 값이므로  nwYn 값으로 nwJoYnInfo 값을 셋팅하여줌.
	 */
	var nwJoYnInfo;

	if(nwYn == 3) nwJoYnInfo = 'Y'
	else nwJoYnInfo = 'N' ;

	if (unOrdinLayer) {
		unOrdinLayer.hiddenUnOrdinLayer();
	}

	var nwLsIncRvs = lsVO.lsValue.nwLsIncRvs;

	// 본문에 제개정문이 호출될 경우
	if (subMenuIdx == '5' && tabMenuIdx == '1' || tabMenuIdx == '6' && subMenuIdx =='1' || tabMenuIdx == '6' && subMenuIdx =='2' || tabMenuIdx == '6' && subMenuIdx =='3') {
		lsVO.lsValue.nwLsIncRvs = "Y";
		nwLsIncRvs = "Y";
	}else{
		lsVO.lsValue.nwLsIncRvs = "";
		nwLsIncRvs = "";
	}

	// 조회이력 검색어 셋팅
	lsVO.lsValue.vSct = lsSearchObj.param.q;
	lsVO.lsValue.tabMenuId = tabMenu;
	lsVO.lsValue.dtlSchLsByl = LsDtlSchSearchObj.dtlSchLsBdyNm

	if (chk != "wide" && $('#openPopYn').is(':checked')) {

		lsVO.lsValue.joChgYn = "";
		lsVO.bdyUpdValue.updateContentNm = lsVO.bdyType;
		lsVO.bdyUpdValue.updateDiv = "bodyContentTOP";

		lsVO.lsValue.lsiSeq = seq;
		lsVO.lsValue.efYd = efYd;
		lsVO.lsValue.chrClsCd = lsVO.LangType; // 기본 언어 설정
		lsVO.lsValue.ancYnChk = ancYnChk;

		if (joCtsTnf()) {
			setPopValue("lsInfoP");
		}

		fPopContent();
		return "";
	}

	lsVO.lsValue.popLsiSeq = seq;

	if ((seq + efYd != lsVO.conValue.hLsiSeq + lsVO.conValue.hEfYd) || tabChgChk) {
		tabChgChk = false;
		lsVO.remove();

		if (nwLsIncRvs) {
			lsVO.lsValue.nwLsIncRvs = nwLsIncRvs;
		}

		if (!lawInfPopAnc(seq, efYd, nwJoYnInfo, ancYnChk)) {
			if ("010201" == chrClsCd) {
				lsVO.LangType = chrClsCd;
			} else {
				lsVO.LangType = "010202"
			}

			if (checkId != '0000') {
				eventObj.list.callLsDepth1(checkId);
			}


			/* 현행이거나 예정일 경우 시행일 단위 법령 조회 */
			if ("3" == nwYn || "2" == nwYn ) {
				ancYnChk = "0";
			}
			if ("1" == ancYnChk) {
				ancYnChk = "";
			}


			lsVO.conValue.preChkId = checkId;
			lsVO.conValue.hLsiSeq = seq; // 동일 선택 위한 저장
			lsVO.lsValue.lsiSeq = seq;

			lsVO.conValue.hEfYd = efYd;
			lsVO.lsValue.efYd = efYd;
			lsVO.lsValue.nwJoYnInfo = nwJoYnInfo;
			lsVO.lsValue.chrClsCd = lsVO.LangType; // 기본 언어 설정
			lsVO.lsValue.ancYnChk = ancYnChk;// 2019.08.13 연혁법령(공포/시행) 여부 파라미터추가 ancYnChk
			lsVO.lsValue.efGubun = efGubun;// 2019.08.13 연혁법령 시행구분 파라미터추가

			//3단비교HTML 만들때 필요한 파라미터 재정의(법령비교 버튼 클릭으로 접근시 undefinde나서 재설정)1028<shcho>
			if ("thdCmpNewScP" == lsVO.openPopValue.popCls) {
				if ("" != lsVO.lsValue.ancYnChk) {
					lsVO.lsValue.ancYnChk = lsVO.lsValue.ancYnChk;
				} else {
					lsVO.lsValue.ancYnChk = "";
				}
				lsVO.lsValue.efGubun = "Y";
			}

			if (el('chrImg') != null && el('chrImg').src.indexOf("_1") > 0) {
				el('chrImg').src = "images/common/btn_v13fn5_1.png";
			}

			if (el("ancYnDv")) {
				lsVO.lsValue.ancYnDv = el("ancYnDv").value;// 공포법령구분(더보기>공포법령
				// 호출시)
			}

			bdyChange(false);
			lsBdyView(lsVO);
			moveCheckLsNm(checkId);

			// 생활법령정보 연계할 데이터 가지고옴 법령본문은 가능
			if (publicLine) {
				csmLnkWrite(seq);
			}

			try {

				el("div_lsSystem").style.display = "none";
				el('mdaLi').style.display = "none";

				// 본문 광고
				if (lsVO.lsValue.lsiSeq == '142322'
						|| lsVO.lsValue.lsiSeq == '141542'
						|| lsVO.lsValue.lsiSeq == '141722') {

					var thdCmpPollCookie = getMyCookie('thdCmpPollAdvertise');
					if (typeof (thdCmpPollCookie) == 'undefined') {
						thdCmpPollAd();
					} else {
						asiaAdvertise();
					}
				} else {
					asiaAdvertise();
				}
			} catch (e) {
				logger.def("법령상세보기 레이어 초기화 중 오류  :::: " + e, 1);
			}
		}
	} else {
		if (!lawInfPopAnc(seq, efYd, nwJoYnInfo, ancYnChk)) {
			if (checkId != '0000') {
				eventObj.list.callLsDepth1(checkId);
			}
			moveCheckLsNm(checkId);
		}
		
		if(typeof nonListGubun != 'undefined'){
			nonListGubun = false;
		}
	}

	// 3단비교에서는 좌측 조문목록 전체를 호출하지 않는다.
	if($("#viewCls").val() != "thdCmpNewScP" && $("#viewCls").val() != "lsPtnThdCmp"){
		if (netPrivateYn == 'N') {
			if (checkId != '0000') {
				// 쿠키에서 값을 환경설정값을 조회하여 트리를 설정한다.
                var lawTree = getCookie("lawTree") == '' ? false : eval(getCookie("lawTree"));
				if (lawTree) {
					/*
                	 * 2019.08.17 lsInfoR에서 좌측 목록호출시 사용
                	 * 기존에는 fSelectJoList 함수를 사용하였으나, 기존함수 그대로 사용시 영향도가 크므로 새로 fSelectJoListAnc함수를 만들어서 사용함.추후 정리필요함.
                	 * 기존함수와의 차이점은 efYd, ancYnChk 파라미터를 추가로 넘김   
					 */
                    fSelectJoListAnc(checkId + 'SpanJo', '99', nwYn, seq, efYd,'',ancYnChk);
				}
			} else {
				/*
				 * 2019.08.17 lsInfoR에서 좌측 목록호출시 사용
				 * 기존에는 fSelectJoList 함수를 사용하였으나, 기존함수 그대로 사용시 영향도가 크므로 새로 fSelectJoListAnc함수를 만들어서 사용함.추후 정리필요함.
				 * 기존함수와의 차이점은 efYd, ancYnChk 파라미터를 추가로 넘김 
				 */
				fSelectJoListAncInfoP('SpanJo', '999', nwYn, seq, efYd, '', ancYnChk);
			}
		}
	}
}

/**
 * <pre>
 * 	법령 상세 보기 (WIDE + LIST)
 * </pre>
 */
function lsViewAllTemp(seq, checkId) { // 법령 상세 보기

	if (seq != lsVO.conValue.hLsiSeq) {
		lsVO.remove();

		if (!lawInfPop(seq)) {
			if (lsVO.LangType == null || lsVO.LangType == "")
				lsVO.LangType = "010202";

			// 목록 내 조문/부칙 트리구조 보여주기
			if (checkId != '0000') {
				eventObj.list.callLsDepth1(checkId);
			}
			lsVO.conValue.preChkId = checkId;
			lsVO.conValue.hLsiSeq = seq; // 동일 선택 위한 저장
			lsVO.lsValue.lsiSeq = seq;
			lsVO.lsValue.chrClsCd = lsVO.LangType; // 기본 언어 설정
			bdyChange(false);

			lsBdyViewTemp(lsVO);

			moveCheckLsNm(checkId);

			try {
				el("moreView").style.display = "none"; // 더보기 닫기
				el("div_lsSystem").style.display = "none";
				el('mdaLi').style.display = "none";

			} catch (e) {
				logger.def("법령상세보기 레이어 초기화 중 오류  :::: " + e, 1);
			}
		}

	} else {
		if (!lawInfPop(seq)) {
			if (checkId != '0000') {
				eventObj.list.callLsDepth1(checkId);
			}
			moveCheckLsNm(checkId);
		}
	}
}

/**
 * <pre>
 * 법령본문상단연혁목록 법령 선택 
 * </pre>
 * @author jhok
 * @since 2019. 8. 17.
 * @param seq
 * @param efYd
 * @param nwJoYnInfo
 * @param ancYnChk
 * 
 * 본문상단 연혁목록 선택시 뜨는 팝업에서도 시행일 법령을 보여주기 위해 lsViewLsHstAnc 함수를 신규생성 
 * 기존의 lsViewLsHst 함수와의 차이점은 시행일 법령을 처리하기위해 efYd, nwJoYnInfo ,ancYnChk 파라미터를 받고 efGubun는 하드코딩으로 세팅하여 넘겨서 처리함.
 */
function lsViewLsHstAnc(seq, efYd, nwJoYnInfo, ancYnChk) {
	LsPopLayer.hiddenLsHstLayer();

	openPop("lsInfoP.do?lsiSeq=" + seq + "&efYd=" + efYd + "&nwJoYnInfo=" + nwJoYnInfo + "&efGubun=Y"
			+ "&chrClsCd=" + lsVO.LangType + "&ancYnChk=" + ancYnChk, 1040);
}


function lsViewLsHst2(seq, ancYd, ancNo, efYd, nwJoYnInfo, ancYnChk , rrClsCd) {
	LsPopLayer.hiddenLsHstLayer();

	openPop("lsInfoP.do?lsiSeq=" + seq + "&ancYd=" + ancYd + "&ancNo=" + ancNo
			+ "&efYd=" + efYd + "&nwJoYnInfo=" + nwJoYnInfo + "&efGubun=Y"
			+ "&chrClsCd=" + lsVO.LangType + "&ancYnChk=" + ancYnChk, 1040);
}

function lsViewLsHst(seq) {
	LsPopLayer.hiddenLsHstLayer();

	openPop("lsInfoP.do?lsiSeq=" + seq + "&chrClsCd=" + lsVO.LangType, 1040);
}

function lsViewLsAncSch(seq) {
	LsPopLayer.hiddenLsHstLayer();
	openPop("lsInfoP.do?lsiSeq=" + seq + "&chrClsCd=" + lsVO.LangType
			+ "&ancYnDv=Y", 1040);
}

/**
 * <pre>
 * 	법령 상세 조회 (WIDE 에서 목록 클릭 시)
 * </pre>
 * @author brKim
 * @since 2017. 6. 12.
 * @param seq
 * @param efYd
 * @param checkId
 * @param obj
 * @param nwYn
 * 
 * 2019.08.13 시행일법령 서비스 관련 ancYnChk, efGubun 파라미터 추가하였고 lsViewAll에도 해당파리미터를 추가하여 호출하도록 수정 
 */
function lsViewWideAll(seq, efYd, checkId, obj, nwYn, ancYnChk, efGubun, tabMenu) {
	
	if (el("openPopYn").checked != true) {
		// wide -> list 본문 보여줄 때
		if(typeof nonListGubun != 'undefined'){
			if (gIsWide == "wide" && !nonListGubun) {
				gIsWide = "default";
				fnWestDefault();
				fnWestDivChange();
			}
		}else{
			if (gIsWide == "wide") {
				gIsWide = "default";
				fnWestDefault();
				fnWestDivChange();
			}			
		}
	}
	/* 2019.08.13 
	 * 연혁법령 시행일 wide 목록에서 클릭시 타는 함수에서 ancYnChk = '0' , efGubun = 'Y'값 넘기는 파라미터 추가
	 * 마지막 두개의 파라미터 추가로 기존 부칙 , 개정문 등에 해당하는 호출의 경우에 해당 파라미터 호출이 없으면 영향이 없음
	 * 추후 부칙 개정문 등에서 시행일 서비스 관련 수정이 필요할 경우 해당 파라미터 사용여부 검토 필요함 
	 */
	lsViewAll(seq, efYd, checkId, "wide", obj, nwYn, "", ancYnChk, efGubun, tabMenu);
}

var time;

/**
 * <pre>
 * 법령상세조회
 * </pre>
 * @author brKim
 * @since 2017. 7. 6.
 * @param lsVO
 */
function lsBdyView(lsVO) { // 법령 상세조회 요청

	if (lsVO.lsValue.lsiSeq) {
		setDetailSelectCookie('010101', lsVO.lsValue.lsiSeq);
		fLsUpd(lsVO);
	}

	window.clearTimeout(time);
}

/**
 * 약칭 도움말풍선 활성, 비활성
 * 
 * @param val
 */
function funcAbrvView(val) {

	var obj = document.getElementById("obj" + val);
	if (obj != null) {
		time = setTimeout("funcViewImg(" + val + ")", 5000);
	} else {
		time = setTimeout("funcAbrvView(" + val + ")", 1000);
	}
}

function funcViewImg(val) {
	document.getElementById("obj" + val).style.display = "none";
	// funcAbrvView();
}

function lsBdyViewTemp(lsVO) { // 법령 상세조회 요청
	if (lsVO.lsValue.lsiSeq != "") {
		lsVO.bdyUpdValue.actionUrl = "lsInfoRTemp.do";
		lsVO.bdyUpdValue.updateDiv = "bodyContent";
		lsVO.bdyUpdValue.updateMode = "lsBdy";
		setDetailSelectCookie('010101', lsVO.lsValue.lsiSeq);
		fLsUpd(lsVO);
	}
}

function lsiSeqCheck() {
	try {
		if (el("lsiSeq").value == "") {
			alert(lsVO.msg);
			return false;
		}
	} catch (e) {
		alert(lsVO.msg);
		return false;
	}
	return true;
}

var viewChk = true;

/**
 * <pre>
 * 	body 내용 변경
 * 	=> 한글법령 본문 일 경우 div > bodyContentTOP 이고
 * 		그 외에는 bodySideContent를 사용한다.
 * </pre>
 * @author brKim
 * @since 2017. 7. 6.
 * @param mode
 * @param dpChange
 */
function bdyChange(mode, dpChange) {

	// 영문법령을 제외한 나머지는 조회 안함
	/*if (subMenuIdx != '4' && $('#popCheckBox').is(':checked')) {
		return false;
	}*/

	$("#outPutLsPtnJoListDiv", $("#lsThdCmpOutPutFrm")).html("");
	SaveWindow.hideLsPtnThdCmpSave();

	var oldAndNewMode = document.getElementById("viewMode");
	var img = document.getElementById("oldAndNewImg");

	if (oldAndNewMode) {
		document.getElementById("subTitle").style.display = "block";
		document.getElementById("viewMode").style.display = "none";
		img.style.display = "none";
	}

	if (mode) {

		if (lsiSeqCheck()) {

			lsVO.lsValue.joChgYn = "";
			lsVO.bdyUpdValue.updateContentNm = lsVO.bdyType;
			lsVO.bdyUpdValue.updateDiv = "bodyContentTOP";
			lsVO.lsValue.nwLsIncRvs = "";
		}

	}

	logger.def("화면전환" + lsVO.conValue.bdyMode, 1);

	var tmpBdySch = false;

	// 조내용, 조제목, 부칙, 제개정문일 경우
	if (subMenuIdx != '6'
			&& (tabMenuIdx == 3 || tabMenuIdx == 4 || tabMenuIdx == 5 || tabMenuIdx == 6)) {
		tmpBdySch = true;
	}

	if (!lsVO.conValue.bdyMode || tmpBdySch) {
		if (joCtsTnf()) {
			setPopValue("lsInfoP");
		}

		lsVO.bdyUpdValue.updateDiv = "bodyContent";

		lsVO.conValue.bdyMode = true;

		$('#bodyContentTOP').css('display', 'block');
		$('#bodySideContent').css('display', 'none');
		layHeight();

		/*
		 * 팝업 또는 본문 새창을 풀고 본문 클릭 시 ajax호출 안함
		 */
		if (!dpChange) {
			lsBdyView(lsVO);
		}

		// 상단 버튼 view 여부
		isBtnView(lsVO.bdyUpdValue.updateContentNm);

	}

	lsVO.updateValue.updateDiv = "bodyContent";

	if (dtlSchEngYn) {// new 상세검색 사용
		f_DtlSchEngKolct(true);
	}
}
// 1. '본문' 버튼 클릭시 최신법령- 공포법령은 본문을 변경하고, 나머지는 전부 팝업으로 띄운다.
// 2. 본문에 조문이 있는 경우는 '본문' 버튼 클릭시 해당 조문이 아닌 본문 전체를 팝업으로 띄운다.
// 3. 본문에 바로 호출되는게 재.개정문의 경우 '본문' 버튼 클릭시 본문을 변경함(팝업으로 띄워주지않음).
function lsContentsView(mode, dpChange, chapNo) {

	if(chapNo){ //민법,상법 편 팝업
		lsVO.lsValue.chapNo = chapNo;
	}

	// 신구법비교 팝업에서 현재 비교되어지는 법령 즉, 우측 법령의 시퀀스 (본문클릭 시 해당 법령으로 리로드 되게)
	if($("#lsiSeq").val() != lsVO.currentChgSeq && lsVO.currentChgSeq != undefined){
		var chgSeqFlag = true;
	}

	if(lsVO.lsValue.lsiSeq == '' || lsVO.lsValue.lsiSeq != $("#lsiSeq").val()){
		lsVO.lsValue.lsiSeq = el("lsiSeq").value;
	}
	
	if(lsVO.lsValue.ancYnChk == '' && el("ancYnChk")) {
		lsVO.lsValue.ancYnChk = el("ancYnChk").value;
	} 
	 
	if((lsVO.lsValue.efYd == '' && el("efYd")) || (lsVO.lsValue.efYd == undefined&& el("efYd"))) {
		lsVO.lsValue.efYd = el("efYd").value;
	}
	$("#eDotViewr").css("display", "block"); // 본문 전환시 전자 점자 활성화
	
	// 최신법령 - 공포법령(제개정문), 팝업의 경우 bdychange
	if(tabMenuIdx == '1' && subMenuIdx =='5' || (tabMenuIdx == '0' && subMenuIdx =='0' && !chapNo) || tabMenuIdx == '6' && subMenuIdx =='1' || tabMenuIdx == '6' && subMenuIdx =='2' || tabMenuIdx == '6' && subMenuIdx =='3'){
		if(chgSeqFlag){
			setPopValue("lsInfoP");
			lsVO.openPopValue.lsiSeq = lsVO.currentChgSeq;
			fPopContent();
		}else{
			bdyChange(mode, dpChange);
			// 본문인 경우 조문 펼치기
			if ($("#west-toggler").attr('title') == 'Open') {
				$('#west-toggler').click();
			}
			//제정·개정문 탭 에서 본문 버튼 클릭 시 핀고정 관련 수정
			if( mode && dpChange
				&& lsVO.updateValue.actionUrl.indexOf("lsRvsDocInfoR.do") > -1 ){
				$('#conTop').css("height", "");
				$("#conScroll").height($("#bodyContentTOP").height() - $("#conTop").height() - 25);
			}
		}

	} else {
		lsVO.lsValue.joChgYn = "";
		lsVO.bdyUpdValue.updateContentNm = lsVO.bdyType;
		lsVO.bdyUpdValue.updateDiv = "bodyContentTOP";
		lsVO.lsValue.chrClsCd = lsVO.LangType; // 기본 언어 설정
		setPopValue("lsInfoP");
		fPopContent();
	}
	//민법,상법 편 팝업 chapNo 초기화
	delete lsVO.lsValue.chapNo;
}

function joCtsTnf() {
	if (lsVO.openPopValue.popMode == 'lsScJoAllRltInfoR'
			|| lsVO.openPopValue.popMode == 'lsScJoRltInfoR') {
		lsVO.openPopValue.lsJoRltDpYn = lsVO.openPopValue.popMode;
		return false;
	} else if (lsVO.openPopValue.lsJoRltDpYn != "") {
		lsVO.openPopValue.popMode = lsVO.openPopValue.lsJoRltDpYn;
		return false;
	}
	return true;
}

function thdLsView() {
	lsVO.conValue.bdyMode = false;
	lsVO.bdyUpdValue.updateContentNm = "thdCmp";
	fThdCmpLsPop();
}

function thdLsView1(lawPop) { // hong
	lsVO.conValue.bdyMode = false;
	lsVO.bdyUpdValue.updateContentNm = "thdCmp";

	if (lawPop == "") {
		fThdCmpLsPop1();

	} else {
		fThdCmpLsPop1('', '', '', '', lawPop);
	}

	/** setHeadTitle 2010 11 05 * */
	if (lawPop == 'lawPop') {
		setHeadTitle("법령 > 인용조문 3단비교");
	}
	/** setHeadTitle end * */
}

function thdLsNewView(lawPop) { // hong

	if(lsVO.lsValue.lsiSeq == '' || lsVO.lsValue.lsiSeq != $("#lsiSeq").val()){
		lsVO.lsValue.lsiSeq = el("lsiSeq").value;
	}
	
	if(lsVO.lsValue.chrClsCd == '' && el("lsBdyChrCls")) {
		lsVO.lsValue.chrClsCd = el("lsBdyChrCls").value;
	}
	
	if(lsVO.lsValue.ancYnChk == '' && el("ancYnChk")) {
		lsVO.lsValue.ancYnChk = el("ancYnChk").value;
	}
	
	var oldAndNewMode = document.getElementById("viewMode");
	var img = document.getElementById("oldAndNewImg");
	if (oldAndNewMode != null && oldAndNewMode != 'undefined') {
		// document.getElementById("viewMode").style.display="none";
		img.style.display = "none";
	}

	lsVO.conValue.bdyMode = false;

	if (lawPop == "") {
		fThdCmpNewLsPop();

	} else {
		fThdCmpNewLsPop('', '', '', '', lawPop);
	}

	/** setHeadTitle 2010 11 05 * */
	if (lawPop == 'lawPop') {
		setHeadTitle("법령 > 인용조문 3단비교");
		lsVO.bdyUpdValue.updateContentNm = "thdCmpNew";
	}
	/** setHeadTitle end * */

	if (lawPop != '' && lawPop != null && lawPop != undefined) {
		$('#copyAddr').css('display', 'none');
		$('#interestLaw').css('display', 'none');
		$('#lsJoMoveDiv').css('display', 'none');
		$('#mnuMinimize').css('display', 'none');
		$('.l_bx').css('display', 'none');
	}
}

/**
 * <pre>
 * 위임법령3단비교조회
 * </pre>
 * @author brKim
 * @since 2017. 7. 7.
 * @param lawPop
 */
function lsPtnThdCmpView(lawPop) {
	
	if(lsVO.lsValue.lsId == '' || lsVO.lsValue.lsId != $("#lsId").val()){
		lsVO.lsValue.lsId = el("lsId").value;
	}
	
	var lsId = lsVO.lsValue.lsId;

	if (!lsId) {
		alert(lsVO.msg);
		return;
	}

	// 본문외의 컨텐츠를 뿌려줌
	lsVO.conValue.bdyMode = false;

	if (lawPop == '' || lawPop == null) {
		lsVO.openPopValue.popMode = "lsPtnThdCmp";
		fPopContent();
	} else {
		sParam.chrClsCd = '010202';
		popParam.lsId = lsId;
		popParam.stdLsId = lsId;
		url = "lspttnThdCmpInfoXml.do";
		fLsPtnThdCmpUpdate("bodySideContent", url, popParam);
		setDisplay("bodyContentTOP", "none");
		setDisplay("bodySideContent", "block");
		$('#copyAddr').css('display', 'none');
		$('#interestLaw').css('display', 'none');
		$('.l_bx').css('display', 'none');
	}
}

/**
 * <pre>
 * 위임법령삼단비교본문상세조회
 * </pre>
 * @author brKim
 * @since 2017. 7. 7.
 */
function lspttnThdCmpInfoSearch() {

	var lsId = $("#searchLsId").val();
	var highLsId = $("#highLsId").val();

	var divLayId = 'lsPttnThdCmpInfo';

	var head = 120; // 메인타이틀 상단까지의 높이
	var popHeight = $(window).height();
	var divHight = popHeight - head;
	$("#lsPttnThdCmpInfo").css("height", divHight);

	layoutLoadMask(divLayId);

	$.ajax({

		url:"lspttnThdCmpXml.do"
	   ,type:'POST'
	   ,dataType:'text'
	   ,data: {
		   'lsId':lsId
		  ,'highLsId':highLsId
		  ,'chrClsCd':sParam.chrClsCd
	   }
	   ,timeout : 150000
	   ,error : function(request, status, error) {
			alert("다시 실행해주시기 바랍니다.");
			layoutUnMask(divLayId);
	   }
	   ,success: function(responseText) {

			$("#lsPttnThdCmpInfo").html(responseText);

			lspttnThdCmpResize();

			layoutUnMask(divLayId);
		}
	});

}

/**
 * <pre>
 * 위임법령사이즈조절
 * </pre>
 * @author brKim
 * @since 2018. 2. 22.
 */
function lspttnThdCmpResize() {
	// 메인타이틀 상단까지의 높이
	var popHeight = $(window).height();
	var maintTitle = $("#lsPtnThdTitle").height();
	var divHight = popHeight - maintTitle - 131;
	$("#divLsPtnThdCmpInfo").css("height", divHight);
}

function thdLsView2() { // hong
	lsVO.conValue.bdyMode = false;
	lsVO.bdyUpdValue.updateContentNm = "thdCmp";
	fThdCmpLsPop2();
}

// ------------- 조문 정보 --------- //

// span 삭제
function deleteSpan(divName) {
	try {
		el(divName).innerHTML = "";

	} catch (e) {
	}
}

// 조문목록 bg 초기화
function joListBgColorClear(idNm) {
	var dt = el(idNm + "Dt");
	dt.className = "dp1";
	el(idNm).style.display = "none";
}

// 조목록 bg 깔기
function setJoListBgColor(idNm) {
	var dt = el(idNm + "Dt");
	if (dt.className != "dep02") {
		dt.className = "dep02";
		el(idNm + "Img").src = el(idNm + "Img").src.replace("btn_plus11",
				"btn_minus11");
		el(idNm).style.display = "";
		return true;
	} else {
		el(idNm + "Img").src = el(idNm + "Img").src.replace("btn_minus11",
				"btn_plus11");
		dt.className = "dep02bgwh";
		el(idNm).style.display = "none";
		return false;
	}
}

function selectJoListReqYn(idNm) {
	if (el(idNm).innerHTML.length > 0) {
		el(idNm).style.display = "none";
		return false;
	} else {
		el(idNm).style.display = "";
		return true;
	}
}

// 변경조문 아닌 목록 text 색 변경
function setChgYnColor(trueAndFasle) {
	try {
		var tag = document.all.tags("div");
		if (tag.length > 0) {
			for (var i = 0; i < tag.length; i++) {

				if (tag[i].name == "default" || tag[i].name == "pyunjang") {
					if (trueAndFasle) {
						if (tag[i].className == "dep02datapdl") {
							tag[i].className = "dep02datagry";
						} else {
							tag[i].className = "dep02datagry";
						}
					} else {
						if (tag[i].className == "dep02datagry"
								&& tag[i].name == "pyunjang") {
							tag[i].className = "dep02datapdlsta";
						} else {
							tag[i].className = "dep02datapdl";
						}
					}
				}
			}
		}
	} catch (e) {
	}
}

// 해당 법령으로 위치 이동
function moveCheckLsNm(checkId) {
	window.location.href = "#" + checkId;
}

// 조문 연혁
function fJoHstShow1(obj, lsId, lsiSeq, joNo, joBrNo, lType) {
	lsVO.lsJoHstPara = "lsId=" + lsId + "&lsiSeq=" + lsiSeq + "&joNo=" + joNo
			+ "&joBrNo=" + joBrNo + "&chrClsCd=" + lType;
	fSlimUpdate("joHstLayer", "lsJoHstProc.do", lsVO.lsJoHstPara);
	// var title = "<div class=\"viewla\"><DIV class=lati1>조문연혁 (공포일기준)</DIV>"
	// +"<DIV class=btnJoHst><A href=\"#AJAX\"
	// onclick=\"javascript:fJoHstPrint();return false;\"><IMG alt=인쇄
	// src=\"/LSW/images/button/btn_print3.gif\"></A>"
	// +"<A href=\"#AJAX\"
	// onclick=\"javascript:LsPopLayer.hiddenJoHstLayer();return false;\"><IMG
	// class=maJoHst alt=닫기 src=\"/LSW/images/button/btn_close.gif\">"
	// +"</A> </DIV></div>";

	var title = "<div class=\"towp2\" id=\"towp2JoHst\"><DIV class=ltit2 id=\"ltit2JoHst\">조문정보 <span>(공포일기준)</span></DIV>"
			+ "<DIV class=btn11>"
			+ "<A href=\"#AJAX\" onclick=\"javascript:fJoHstPrint();return false;\" title=\"팝업으로 이동\"><IMG alt=인쇄 style=\"margin-left:85px;\" src=\"/LSW/images/button/btn_print3.gif\"></A>"
			+ "</DIV><div class=\"btn22\">"
			+ "<A href=\"#AJAX\" onclick=\"javascript:LsPopLayer.hiddenJoHstLayer();return false;\"><IMG class=maJoHst alt=닫기 src=\"/LSW/images/button/btn_close8.gif\">"
			+ "</A></DIV></div>";
	// +"</div>";
	LsPopLayer.showJoHstLayer(0, title);
}

/**
 * <pre>
 * 	본문 내 조문연혁 조회 (연버튼)
 * </pre>
 * @author brKim
 * @since 2017. 6. 12.
 * @param obj
 * @param lsId
 * @param lsiSeq
 * @param joSeq
 * @param lType
 */
function fJoHstShow(obj, lsId, lsiSeq, joSeq, lType) {

	document.body.style.cursor = "wait";

	// 검색 하기 전 영역 초기화
	$("#joHstLayer").html("");

	lsVO.comparePrevNo = -1; // 조문연혁 떼깔 초기화
	lsVO.lsJoHstPara = "lsId=" + lsId + "&lsiSeq=" + lsiSeq + "&joSeq=" + joSeq
			+ "&chrClsCd=" + lType;

	fSlimUpdateByAjax("joHstLayer", "lsJoHstProc.do", lsVO.lsJoHstPara); // fSlimUpdate

	var title = "<div class='towp2' id='towp2JoHst' style='margin-top: -33px;'>" +
					"<div class='ltit2' id='ltit2JoHst'>조문정보 <span>(공포일기준)</span></div>" +
					"<div class=btn11>" +
						"<a href=\"#\" onclick=\"javascript:fJoHstPrint(this);return false;\" title=\"팝업으로 이동\">" +
			      	  		"<img alt=인쇄 style=\"margin-left:50px;margin-right:0px;\" src=\"" + webRoot + "/images/button/btn_print6.gif\">" +
			      	  	"</a>" +
			      	  	"<a href=\"#\" onclick=\"javascript:fJoHstSaveLayer(this);return false;\" title=\"팝업으로 이동\">" +
		      	  			"<img alt=저장 style=\"margin-left:10px;margin-right:0px;\" src=\"" + webRoot + "/images/button/btn_save2.gif\">" +
		      	  		"</a>" +
			      	"</div>" +
			      	"<div class=\"btn22\">" +
			      		"<a href=\"#\" onclick=\"javascript:LsPopLayer.hiddenJoHstLayer();return false;\">" +
			      			"<img class=maJoHst alt=닫기 src=\"" + webRoot + "/images/button/btn_close8.gif\">" +
			      		"</a>" +
			      	"</div>" +
			    "</div>";

	LsPopLayer.showJoHstLayer(0, title);

	var timer;
	tmpAreaChk = true;

	var tmpVal = "";
	var tmpNumVal = "";
	var tmpNumVal2 = "";

	var f = function() {

		if (el("joHstInfoHong") != null) {
			var vVal1 = el("joHstInfoHong").value - 1;
			var vVal2 = el("joHstInfoHong").value - 2;

			var lsJoEfYdSeq1 = el("lsJoEfYdSeq1").value;
			var lsJoEfYdSeq2 = el("lsJoEfYdSeq2").value;

			bfCmp(vVal2, lsJoEfYdSeq1, lsJoEfYdSeq2);

			document.getElementById("joHstDiv").scrollLeft = 50000; // 강제로 이동

			tmpAreaChk = false;
			clearInterval(timer);
		}
	}

	timer = setInterval(f, 200);
}

// /////////////////////////////////////////////////////////////////////////////

function fJoCompShow(obj, lsId, lsiSeq, joSeq, lType) {
	lsVO.comparePrevNo = -1; // 조문연혁 떼깔 초기화
	lsVO.lsJoHstPara = "lsId=" + lsId + "&lsiSeq=" + lsiSeq + "&joSeq=" + joSeq
			+ "&chrClsCd=" + lType;
	fSlimUpdateByAjax("joHstLayer", "lsJoHstProc.do", lsVO.lsJoHstPara); // fSlimUpdate

	var title = "<div class=\"towp2\" id=\"towp2JoHst\"><DIV class=ltit2 id=\"ltit2JoHst\">조문정보 <span>(공포일기준)</span></DIV>"
			+ "<DIV class=btn11>"
			+ "<A href=\"#AJAX\" onclick=\"javascript:fJoHstPrint();return false;\" title=\"팝업으로 이동\"><IMG alt=인쇄 style=\"margin-left:104px;margin-right:0px;\" src=\"/LSW/images/button/btn_print6.gif\"></A>"
			+ "</DIV><div class=\"btn22\">"
			+ "<A href=\"#AJAX\" onclick=\"javascript:LsPopLayer.hiddenJoHstLayer();return false;\"><IMG class=maJoHst alt=닫기 src=\"/LSW/images/button/btn_close8.gif\">"
			+ "</A></DIV></div>";
	// +"</div>";
	LsPopLayer.showJoHstLayer(0, title);
}

// /////////////////////////////////////////////////////////////////////////////

/**
 * <pre>
 * 연혁비교인쇄버튼 실행
 * </pre>
 * @author brKim
 * @since 2017. 10. 24.
 */
function fJoHstPrint() {

	// 인쇄 레이어 출력
	mode = 200;

	fJoHstLayerUpdate("lsJoHstPrintLayer", "lsJoHstProc.do", lsVO.lsJoHstPara + "&mode=200");

	LsPopLayer.showLsJoHstPrintLayer();

}

function fJoHstSaveLayer() {

	// 저장 레이어 출력
	mode = 300;

	fJoHstLayerUpdate("lsJoHstSaveLayer", "lsJoHstProc.do", lsVO.lsJoHstPara + "&mode=300");

	LsPopLayer.showLsJoHstSaveLayer();

}

// 조문 연혁 인쇄
function fJoHstPrintPop() {
	
	var lsiSeqs = "";
	var checkTotal = $("input[name='joHstList']:checked").length;

	$("input[name='joHstList']:checked").each(function(index) {
		lsiSeqs += $(this).val();
		if (index != checkTotal - 1) {
			lsiSeqs += ",";
		}
	});

	var url = "lsJoHstProc.do?" + lsVO.lsJoHstPara + "&mode=100&lsiSeqs="+lsiSeqs;
	openScrollPop(url);
	
	LsPopLayer.closeLsJoHstPrintLayer();
}

// 조문 연혁 저장
function fJoHstSave() {
	
	var frm = el("outPutFrm");

	var lsiSeqs = "";
	var checkTotal = $("input[name='joHstList']:checked").length;

	$("input[name='joHstList']:checked").each(function(index) {
		lsiSeqs += $(this).val();
		if (index != checkTotal - 1) {
			lsiSeqs += ",";
		}
	});
	
	// 저장 TYPE ( 한글, PDF, DOC )
	var fileType = "";
	frm.action = "";
	fileType = $("input:radio[name='fileType']:checked").val();

	if(fileType == "hwp"){
		frm.action = "lsJoHstHwpSave.do?" + lsVO.lsJoHstPara + "&lsiSeqs="+lsiSeqs;
	}else if(fileType == "pdf"){
		frm.action = "lsJoHstPdfSave.do?" + lsVO.lsJoHstPara + "&lsiSeqs="+lsiSeqs;
	}else if(fileType == "doc"){
		frm.action = "lsJoHstDocSave.do?" + lsVO.lsJoHstPara + "&lsiSeqs="+lsiSeqs;
	}
	
	frm.submit();
	
	LsPopLayer.closeLsJoHstSaveLayer();
}

/**
 * <pre>
 * 	연혁 비교 인쇄 레이어 AJAX 호출
 *  => fJoHstPrint() 호출 후
 * </pre>
 * @author brKim
 * @since 2017. 10. 25.
 * @param divId
 * @param urlName
 * @param parameter
 */
function fJoHstLayerUpdate(divId, urlName, parameter) {
	$.ajax({
		url : urlName,
		type : 'post',
		dataType : 'text',
		data : parameter,
		timeout : 150000,
		success : function(responseData) {
			var $div = $('#' + divId);
			$div.html(responseData);
		},
		error : function(request, status, error) {
			alert("다시 실행해주시기 바랍니다. :: " + status);
		}
	});
}

function funcVisi(obj) {
	setTimeout(funcHid(obj), 3000);
}

function funcHid(obj) {
	obj.visible = false;
}

// 예정 법령 조회
// 예정 법령 조회
function fEfYdLsPop(lsiSeq) {
	openPop("lsEfInfoP.do?lsiSeq=" + lsiSeq, 1024);
}

// 입법예고 목록 조회
function lmppView(lsiSeq) {
	var url = "lsLmppListP.do?lsiSeq=" + lsiSeq;
	var popupX = $("img[src$='btn_org05.gif']").offset().left - 269;
	var popupY = $("img[src$='btn_org05.gif']").offset().top - 135;

	var win = window.open(url, '입법예고 정보', 'scrollbars=yes,toolbar=no,resizable=yes,status=no,menubar=no,width=538px,height=135px,left=' + popupX + ',top=' + popupY);
}

// 현행 법령 조회
function fLsPop(lsId, ancYnChk) {
	openPop("lsInfoP.do?lsId=" + lsId + "&ancYnChk=" + ancYnChk, 1000);
}

// '현행법령이동' 클릭 시 해당 법령명으로 현행법령 목록 조회하는 화면 이동
function fLsCurMovePop(lsNm) {
	document.location.href = "lsSc.do?menuId=1&subMenuId=15&tabMenuId=81&query="+lsNm;
}

function fLsNewTab(lsId, ancYnChk){
	window.open("lsInfoP.do?lsId=" + lsId + "&ancYnChk=" + ancYnChk);
}

/**
 * <pre>
 * 연혁버튼레이어생성
 * </pre>
 * @author brKim
 * @since 2017. 6. 12.
 * @param obj
 * @param xValue
 * @param chrClsCd
 */
function fLsHstShow(obj) {

	LsPopLayer.hiddenLsBylLayer();

	if (!el("lsiSeq")) {
		alert(lsVO.msg);
		return;
	}
	
	if(lsVO.lsValue.lsiSeq == '' || lsVO.lsValue.lsiSeq != $("#lsiSeq").val()){
		lsVO.lsValue.lsiSeq = el("lsiSeq").value;
	}

	var lsRvsChk = 'false';
	if (lsRvsChk == 'true') {
		lsVO.lsValue.lsId = el("rvsLsId").value;
		// 본문에서 연혁버튼을 클릭하였을시
	} else if (lsVO.lsValue.lsId == "" || lsVO.lsValue.lsId != el("lsId").value) {
		lsVO.lsValue.lsId = el("lsId").value;
	}

	// 연혁 첫 호출 이후엔 다시 호출 하지 않는다.
	if (LsPopLayer.isFirstCallLsHstLayer()) {
		fSlimUpdate("lsHstLayer", "lsHstListR.do", makeParam(lsVO.lsValue));
	}

	LsPopLayer.showLsHstLayer(obj);

}

/**
 * <pre>
 * 영문법령 연혁버튼 레이어생성
 * </pre>
 * @author smlee
 * @since 2022. 8. 12.
 * @param obj
 */
function fEngHstViewShow(obj) {
	LsPopLayer.hiddenLsBylLayer();
	
	if (!el("lsiSeq")) {
		alert(lsVO.msg);
		return;
	}
	
	if(lsVO.lsValue.lsiSeq == '' || lsVO.lsValue.lsiSeq != $("#lsiSeq").val()){
		lsVO.lsValue.lsiSeq = el("lsiSeq").value;
	}
	
	lsVO.lsValue.lsId = el("lsId").value;
	
	// 연혁 첫 호출 이후엔 다시 호출 하지 않는다.
	if (LsPopLayer.isFirstCallLsHstLayer()) {
		fSlimUpdate("lsHstLayer", "lsEngHstListR.do", makeParam(lsVO.lsValue));
	}
	LsPopLayer.showLsEngHstLayer(obj);
}

/* 위임자치법규 START */
function fUnOrdinShow(obj, xValue, chrClsCd) {
	LsPopLayer.hiddenUnOrdinLayer();

	if (lsVO.lsValue.lsiSeq == "") {
		alert(lsVO.msg);
		return;
	}

	fSlimUpdate("unOrdinLayer", "unOrdinListR.do", makeParam(lsVO.lsValue));
	LsPopLayer.showUnOrdinLayer(obj, xValue);
}
/* 위임자치법규 END */

/**
 * <pre>
 * 	별표/서식 레이어 생성
 * </pre>
 * @author brKim
 * @since 2017. 6. 12.
 * @param obj
 */
function fLsBylShow(obj) {

	LsPopLayer.hiddenLsHstLayer(); // 별표서식이 클릭 될 경우

	if (!el("lsiSeq")) {
		alert(lsVO.msg);
		return;
	}

	if (lsVO.lsValue.lsiSeq == "" || lsVO.lsValue.lsiSeq != $("#lsiSeq").val()) {
		lsVO.lsValue.lsiSeq = $("#lsiSeq").val();
	}

	if (lsVO.lsValue.lsId == "" || lsVO.lsValue.lsId != $("#lsId").val()) {
		lsVO.lsValue.lsId = $("#lsId").val();
	}

	// 첫 호출 이후엔 목록을 다시 가져오지 않는다.
	if (LsPopLayer.isFirstCallLsBylLayer()) {
		fSlimUpdate("lsBylLayer", "lsBylListR.do", makeParam(lsVO.lsValue));
	}

	LsPopLayer.showLsBylLayer(obj);
}

function fCsmLnkShow(obj, xValue) {
	el("lsCsmLnkDivWrite").innerHTML = el("csmLnkListDiv").innerHTML;
	LsPopLayer.showLsCsmLnkLayer(obj, xValue);
}

// 새창으로 팝업 모드 설정
function setPopValue(mode) {
	lsVO.openPopValue.popMode = mode;
	lsVO.openPopValue.lsiSeq = getValue("lsiSeq");
}

function isLsOpenPopYn() {
	return el('popCheckBox').checked;
}

function fPopContent() {
	var url = "lsInfoP";
	var width = "1040";
	var lsId = getLsId();
	var viewCls = lsVO.openPopValue.popMode;
	var vSct = lsSearchObj.param.q;
	var ancYnChk = lsVO.lsValue.ancYnChk;
	var efGubun = lsVO.lsValue.efGubun;
	
	if (lsVO.openPopValue.popMode == "lsInfoP") {
		url = lsVO.openPopValue.popMode;

	} else if (lsVO.openPopValue.popMode == "thdCmpScP") { // 3단비교
		// url = "thdCmpScP";
		url = "thdCmpJoAllInfoP";

	} else if (lsVO.openPopValue.popMode == "thdCmpNewScP") { // 3단비교(New)
		// url = "thdCmpScP";
		url = "thdCmpNewJoAllInfoP";

	} else if (lsVO.openPopValue.popMode == "lsOldAndNew") {
		lsId += "&ancYd=" + lsVO.lsValue.ancYd + "&ancNo=" + lsVO.lsValue.ancNo
	} else if (lsVO.openPopValue.popMode == "lsScJoRltInfoR") {
		lsId = "&joNo=" + lsVO.lsValue.joNo + "&joBrNo=" + lsVO.lsValue.joBrNo
				+ "&docCls=" + lsVO.lsValue.docCls;

	} else if (lsVO.openPopValue.popMode == "lsScJoAllRltInfoR") {
		lsId = "&paras=" + lsVO.lsValue.paras;
	} else if (lsVO.openPopValue.popMode == "engLsInfoR") { // 3단비교
		url = "lsInfoP";
	} else if (lsVO.openPopValue.popMode == "lsRvsDocInfoR") {
		lsId = "&efYd=" + lsVO.lsValue.efYd;
	} else if (lsVO.openPopValue.popMode == "LsInfoE") { // 영문법령에서 한글본문팝업
		url = "lsInfoP";
		lsVO.openPopValue.popMode = "lsInfoR"
		viewCls = lsVO.openPopValue.popMode;
	} else if (lsVO.openPopValue.popMode == "lsPtnThdCmp") { // 위임법령 3단비교
		viewCls = lsVO.openPopValue.popMode;
	}
	/*
	 * 2019.08.23 <shcho> 시행일/공포 서비스개선 : 시행,연혁(ancYnChk: 0=시행, 1=공포) 파라미터 추가 *
	 * - 상세변경내역 : "&ancYnChk=" + lsVO.lsValue.ancYnChk 추가*/
	if (lsVO.openPopValue.lsEfYn || lsVO.openPopValue.popMode == "lsOldAndNew"
			|| lsVO.openPopValue.popMode == "thdCmpScP"
			|| lsVO.openPopValue.popMode == "thdCmpNewScP"
			|| lsVO.openPopValue.popMode == "lsRvsDocInfoR"
			|| lsVO.openPopValue.popMode == "lsPtnThdCmp") {
		if (lsVO.openPopValue.lsEfYn) {
			openPop("lsInfoP.do?" + lsVO.openPopValue.lsEfSeq + "&lsId=" + lsId
					+ "&chrClsCd=" + lsVO.lsValue.chrClsCd
					+ "&urlMode=lsEfInfoR" + "&viewCls=" + viewCls
					+ "&ancYnChk=" + ancYnChk, width);

		} else {
			openPop("lsInfoP.do?lsiSeq=" + lsVO.lsValue.lsiSeq + "&lsId="
					+ lsId + "&chrClsCd=" + lsVO.lsValue.chrClsCd
					+ "&urlMode=lsEfInfoR" + "&viewCls=" + viewCls
					+ "&ancYnChk=" + ancYnChk, width);
		}

	}else if("lsArAllBdy" == lsVO.bdyUpdValue.updateContentNm 
			|| "lsJoBdy" == lsVO.bdyUpdValue.updateContentNm 
			|| "lsJoAllBdy" == lsVO.bdyUpdValue.updateContentNm ){
		openPop(url + ".do?lsiSeq=" + lsVO.lsValue.lsiSeq + "&lsId=" + lsId
				+ "&chrClsCd=" + lsVO.lsValue.chrClsCd + "&urlMode="
				+ lsVO.openPopValue.popMode + "&viewCls=" + viewCls + "&efYd="
				+ lsVO.lsValue.efYd + "&vSct=" + encodeURIComponent(vSct)
				+ "&ancYnChk=" + ancYnChk+ "&efGubun=" + efGubun, width);
	} else {
		if(lsVO.currentChgSeq) {
			url += ".do?lsiSeq=" + lsVO.currentChgSeq + "&lsId=" + lsId
				+ "&chrClsCd=" + lsVO.lsValue.chrClsCd + "&urlMode=" + lsVO.openPopValue.popMode;
			window.location.replace(url);
		}else {
			url += ".do?lsiSeq=" + lsVO.lsValue.lsiSeq + "&lsId=" + lsId
				+ "&chrClsCd=" + lsVO.lsValue.chrClsCd + "&urlMode="
				+ lsVO.openPopValue.popMode + "&viewCls=" + viewCls + "&efYd="
				+ lsVO.lsValue.efYd + "&vSct=" + encodeURIComponent(vSct)
				+ "&ancYnChk=" + ancYnChk;

			if (undefined != lsVO.lsValue.chapNo && "" != lsVO.lsValue.chapNo) {
				url += "&chapNo=" + lsVO.lsValue.chapNo;
			}
			openPop(url, width);
		}
	}
}

/* checkbox checked=false 변경 */
function checkFalse(checkId) {
	if (el(checkId).checked)
		el(checkId).checked = false;
	;
}

/* 전체 checkbox 선택시 checkbox 모두 false 변경 */
function checkAllFalse(allcheckId, checkName) {
	logger.def(allcheckId + "---" + checkName, 1);
	var checked = el(allcheckId).checked;
	if (checked) {
		var cnt = els(checkName);
		for (var i = 0; i < cnt.length; i++) {
			if (cnt[i].checked)
				cnt[i].checked = false;
		}
	}
}

/* 상세 검색 소관부처 선택 */
function checkAllGroup(number) {

	var idName = "group" + number;
	var checked = el(idName).checked;
	var tid = "";
	if (number.length > 1) {
		tid = "group" + number.substring(1);
	} else {
		tid = "group" + number;
		tid = tid + number;
	}
	inputclickMt(el(tid), checked);
	var checkArray = els("cptOfis");
	var id = "";
	for (var i = 0; i < checkArray.length; i++) {
		id = checkArray[i].id;
		if (id.substring(0, 6) == idName) {
			inputclickMt(checkArray[i], checked);
			// inputclick(checkArray[i]);
		}
	}
	checkCptOfi();
}

function checkCptOfi() {
	// el('allCptOfi').checked = !isCheckboxArrayChecked(els("cptOfis"));
	// checkFalse('allCptOfi');
}

function setSelectedOrg(idName, elName) {
	var array = chkArrayTitleToStringArray(els(idName));
	el(elName).innerHTML = arrayToSomeAndEtcString(array, 1);
}

function showCptOfiDiv(obj) {
	var divCptOfi = el("divCptOfi");
	var imgShowCptOfi = el("imgShowCptOfi");
	if (divCptOfi.style.display == "none") {
		divCptOfi.style.display = "block";
		LayerToLayer.show("divCptOfiContent", obj, 507, 1);
		Ext.get("detailCtDiv").addListener("click", detailCtDivAddEvent);
		imgShowCptOfi.src = imgShowCptOfi.src.replace("btn_deseop.gif",
				"btn_desecl.gif");
	} else {
		divCptOfi.style.display = "none";
		imgShowCptOfi.src = imgShowCptOfi.src.replace("btn_desecl.gif",
				"btn_deseop.gif");
		setSelectedOrg("cptOfis", "selectedOrg");
		LayerToLayer.close();
		Ext.get("detailCtDiv").removeListener("click", detailCtDivAddEvent);
	}
}

function showLsClsDiv() {
	var divCptOfi = el("divLsCls");
	var imgShowCptOfi = el("imgShowLsCls");
	if (divCptOfi.style.display == "none") {
		divCptOfi.style.display = "block";
		imgShowCptOfi.src = imgShowCptOfi.src.replace("btn_deseop.gif",
				"btn_desecl.gif");
	} else {
		divCptOfi.style.display = "none";
		imgShowCptOfi.src = imgShowCptOfi.src.replace("btn_desecl.gif",
				"btn_deseop.gif");
		setSelectedOrg("lsCls", 'selectedLsCls');
	}
}

/* 상세 검색 표시 설정 */
function detailSearchDp() {
	if (el("desewrap").style.display == "") {
		setDisplay("desewrap", "none");
	} else {
		setDisplay("desewrap", "");
		//

	}
}

// selectbox select
function setSelectBox(obj, value) {
	try {
		for (var i = 0; i < obj.options.length; i++) {
			if (obj.options[i].value == value) {
				obj.options[i].selected = true;
			} else {
				obj.options[i].selected = false;
			}
		}
	} catch (e) {
		logger.err(obj.id + ":" + e);
	}
}

/* 상세 검색 초기화 */
function deleteDetailInfo() {
	// 법령 종류 초기화
	checkAllFalse("allLsCls", "lsCls");
	inputclickMt(el("allLsCls"), true);
	// el("selectedLsCls").innerHTML = "";
	logger.def("법령초기화 완료", 1);
	// 소관부처 초기화
	checkAllFalse("allCptOfi", "cptOfi");
	inputclickMt(el("allCptOfi"), true);
	el("selectedOrg").innerHTML = "";
	logger.def("소관부처 완료", 1);
	// 입법구분 초기화
	checkAllFalse("allRrClsCd", "rrClsCd");
	inputclickMt(el("allRrClsCd"), true);
	// 공포번호 초기화
	el("frmAncNo").value = "";
	el("toAncNo").value = "";
	logger.def("공포번호 완료", 1);
	// 공포일자
	el("frmAncYd").value = "";
	el("toAncYd").value = "";
	logger.def("공포번호 완료", 1);
	// 시행일자
	// el("frmEfYd").value = "";
	// el("toEfYd").value = "";
	// logger.def("시행일자 완료",1);
	// 검색범위 초기화
	// checkAllFalse("allRrClsSecD","rrClsSecD");
	// inputclickMt(el("allRrClsSecD"),true);
	// 검색어 초기화
	// el("lsNmSearch").value = "";
	// 법령내용 초기화
	// el("lsCtSearch").value = "";
	// 개정정보 전체 초기화
	// el("docTypeRvs").checked = false;
	// el("docTypeRsn").checked = false;
	// logger.def("개정정보 완료",1);
	// 법령조문 초기화
	// inputclickMt(el("docTypeJo"), true);
	// inputclickMt(el("docTypeAr"), true);
	// inputclickMt(el("docTypeByl"), true);
	// inputclickMt(el("docTypeRvs"), false);
	// inputclickMt(el("docTypeRsn"), false);
	// logger.def("법령조문 완료",1);

}

/* 체크 값 가져오기 */
function getCheckedValue(elsNm) {
	var list = els(elsNm);
	var idx = "";
	var total = 0;
	for (var i = 0; i < list.length; i++) {
		if (list[i].checked) {
			if (list[i].value != "00") {
				idx += "," + list[i].value;
			}
		}
	}
	return idx.substring(1);
}

function fOldAndNew() {
	if (el("lsiSeq").value != "") {
		Ext.get("byl" + bylSeq).load(
				{
					url : "lsOldAndNew.do",
					scripts : true,
					params : "&lsiSeq=" + el("lsiSeq").value + "&lsId="
							+ el("lsId").value
				});
	} else {
		alert(LsValueObj.msg);
	}
}

/**
 * 	2018.11.29. 2018 국가법령 - 기존 오류 수정
 *  2018.12.06. 2018 국가법령 - 화면내검색의 별표본문내용 검색 체크박스 추가 관련 기능 개선
 */
function lsBodySearch(obj) {
	/*var seq = "";
	seq = el("lsiSeq").value;

	if (seq == "" || seq == 'undefined')
		return false;*/

	if ($("#lsiSeq:first").length == 0 || $("#lsiSeq:first").val() == "") {
		return false;
	}

	// 법령 본문 또는 법령 팝업
    if ($("#topDiv #naviId li.m1.on").length == 1 || $("#searchForm .pophead h2:first").text() == "법령") 
    {
    	// subMenuIdx : 1-현행, 2-연혁, 3-근대, 4-영문, tabMenuIdx : 1-법령명, 2-법령본문, 5-부칙, 6-제정·개정문
		// subMenuIdx : 4-영문, tabMenuIdx : 1-법령명, 2-법령본문
		// subMenuIdx : 5-최신, tabMenuIdx : 1-공포, 2-시행, 3-시행예정, 5-한시법령
        if ((subMenuIdx == "1" || subMenuIdx == "2" || subMenuIdx == "3") && (tabMenuIdx == "1" || tabMenuIdx == "2" || tabMenuIdx == "5" || tabMenuIdx == "6")) {
			isBylSearch = true;
        }
        else if (subMenuIdx == "4" && (tabMenuIdx == "1" || tabMenuIdx == "2")) {
			// 토글(한글)
			if ($('#bdyBtnKO').text().indexOf("영문") > -1) {
				isBylSearch = true;
			}
			// 토글(영문)
			else {
				isBylSearch = false;
			}
        }
        else if (subMenuIdx == "5" && (tabMenuIdx == "1" || tabMenuIdx == "2" || tabMenuIdx == "3" || tabMenuIdx == "5")) {
			isBylSearch = true;
        }
        else if ($("#searchForm .pophead h2:first").text() == "법령") {
			isBylSearch = true;
        }
        else {
			isBylSearch = false;
		}

		// 별표 본문 내용 검색 체크박스
		if (isBylSearch) {
			if ($("input:checkbox[id=selectSearchByl]").length == 0) {
				var chkTit = " title=\"검색 시간이 오래 걸릴 수 있습니다.\"";
                $("#bdySearchLayer").find(".inctn:first").append("<input type=\"checkbox\" id=\"selectSearchByl\" class=\"check\"" + chkTit + "><label for=\"selectSearchByl\"" + chkTit + ">별표본문내용</label>");
			}
        }
        else {
			if ($("input:checkbox[id=selectSearchByl]").length > 0) {
                $("input:checkbox[id=selectSearchByl]").next().remove().end().remove();
			}
		}
		SaveWindow.showBydSearch(obj, 0, 0, "LS");
    }
    else {
		SaveWindow.showBydSearch(obj, 0, 0);
	}

	var timer;
	var f = function() {
		clearInterval(timer);

		if (el('bdySearch'))
			el('bdySearch').focus();
	}

	timer = setInterval(f, 200);
}

function lsBodySearch2(obj) {
	var seq = "";
	seq = el("lsiSeqs").value;

	if (seq == "" || seq == 'undefined')
		return false;
	SaveWindow.showBydSearch(obj, 0, 0);

	var timer;
	var f = function() {
		clearInterval(timer);

		if (el('bdySearch'))
			el('bdySearch').focus();
	}

	timer = setInterval(f, 200);
}

function bdySearch(obj) {
	var schKey = el("bdySearch");
	var chkMode = "down";
	var AddValue = schKey.value.indexOf("|");

	if (obj != null) {
		if (obj[0].checked)
			chkMode = "up";
	}

	if (schKey == null || schKey == "") {
		alert("검색키워드를 입력하세요");
		el("bdySearch").focus();

	} else {
		if (lsVO.updateValue.updateDiv == "bodySideContent") {
			bodySearchAll('bodySideContent', schKey.value, "bdySearch", chkMode);

		} else if (lsVO.updateValue.updateDiv == "viewwrapCenter") {
			bodySearchAll('viewwrapCenter', schKey.value, "bdySearch", chkMode);

		} else if (AddValue > -1) {// 화면내검색 검색어에 문자열 "|" 이 있다면
			bodyAddSearch('bodyContent', schKey.value);

		} else if (lsVO.updateValue.updateDiv == "bodyContent") { // 본문

			if (lsVO.bdyUpdValue.updateContentNm == "lsBdy") {
				bodyInfoRSearch('sideCenter');
			}else if(lsVO.bdyUpdValue.updateContentNm == "lumThdCmp" || lsVO.bdyUpdValue.updateContentNm == "lsPtnThdCmp" || lsVO.bdyUpdValue.updateContentNm == "lumThdCmpSc"){	
				// 3단비교
				bodyInfoRSearch('bodySideContent');
			} else { // 재개정문
				bodySearchAll('bodyContent', schKey.value, "bdySearch", chkMode);
			}
		} else {
			bodySearchAll('bodyContent', schKey.value, "bdySearch", chkMode);
		}
		setBdySchKeywordCookie(el('bdySearch'), el('bdyKeyVal'));
		// bodySearchAll('arDivArea', schKey.value, "bdySearch");
	}
}

function cptOfiPop(url) {
	var strUrl = "";
	if (url.indexOf("http") < 0)
		url = "http://" + url;

	window
			.open(
					url,
					'',
					'location=yes,scrollbars=yes,toolbar=yes,resizable=yes,status=yes,menubar=yes,width=1024,height=768');
}

function openPopSet(obj, cnt) {
	/*
	 * if(cnt <= 0){ alert("조회할 목록이 없습니다."); obj.checked = false; return; }
	 */
	checkAllCheckbox(obj.checked, els("openYn"));
}

// 넓은목록 검색 건수 조회
function wideGetTotCnt() {
	var totCnt = el("readNumDiv").innerHTML;
	if (totCnt == "") {
		totCnt = 0;
	} else {
		totCnt = totCnt.replace('총<STRONG>', '').replace('</STRONG>건', '');
		if (totCnt == "")
			totCnt = 0;
	}
	return totCnt;
}

// 상세검색 Layer 설정
var detailSearchVal = false;
function detailSearchOpen() {
	if (detailSearchVal) {
		// DetailSearchLayer.hide();
		el("detailSearchId").style.display = "none";
		LayerToLayer.close();
		detailSearchVal = false;
	} else {
		// DetailSearchLayer.show("detailSearchId");
		el("detailSearchId").style.display = "";
		detailSearchVal = true;
		if (Ext.isIE6) {
			el('detailSearchId').style.left = "-640px";
			if (el('detailIframe')) { /*
										 * IE6에서 select 박스 위로 올라오는 문제 때문에 어쩔수 없이
										 * 만들었음..
										 */
				el('detailIframe').style.top = "35px";
				el('detailIframe').style.height = "150px";
				el('detailIframe').style.width = "676px";
			}
		}
	}
}

function detailSearchClose() {
	// LayerToLayer.close();
	// DetailSearchLayer.hide();
	detailSearchVal = true;
	detailSearchOpen();
}

function setMdaDP() {
	if (el('mdaYn') && el('mdaYn').value == '1') {
		el('mdaLi').style.display = "";
	}

	if (el('nwYnValue') != null) {// 공포법령 보기 버튼
		if (el('nwYnValue').value == 'Y') {
			if (el('nwYnMore') != null) {
				el('nwYnMore').style.display = "block";
			}
		} else {
			if (el('nwYnMore') != null) {
				el('nwYnMore').style.display = "none";
			}
		}
	} else {
		if (el('nwYnMore') != null) {
			el('nwYnMore').style.display = "none";
		}
	}
}

function lsMdaInfoP() {
	var url = "lsInfoP.do?lsiSeq=" + lsVO.lsValue.lsiSeq + "&chrClsCd=010204";
	openPop(url, 1020);
}

function lsOnclick(csmUrl) {
	openScrollPop(csmUrl, '1000px', '760px');
}

function lsDetailOnclick() {
	// openScrollPop("http://oneclick.law.go.kr/CSP/CnpClsMain.laf?csmSeq=240&ccfNo=1&cciNo=1&cnpClsNo=2#mark0",
	// '1000px','760px');
	var seq = el("lsiSeq").value;
	if (seq == "" || seq == 'undefined') {
		alert(lsVO.msg);
		return false;
	}
	// alert(joSelect_csmUrl);
	if (joSelect_csmUrl.length > 0) {
		oneClickNmJo(joSelect_csmUrl);
	}
}

// 법령 화면 초기화
function lsDpInitialize(mode) {
	// 조 선택 레이어
	try {
		el("joSelectLayer").style.display = "none";

		SaveWindow.hideInfoSave(); // 인쇄 저장 초기화
		LsPopLayer.closeLsOutPutLayer(); // 법령 인쇄 /저장 초기화
		LsPopLayer.closeLsTtsLayer(); // 법령 음성지원 초기화
	} catch (e) {
	}
}

function oneClickNmJo(url) {
	// var url = "http://oneclick.law.go.kr/CSP/LawLkCsm.laf?LsNm=" +
	// encodeURIComponent(lsNm);
	window
			.open(
					url,
					'csmPop',
					'left=0,top=0,menubar=yes,toolbar=yes,location=yes,scrollbars=yes,status=yes,resizable=yes,width=1000px,height=700px');
}

function oneClickNm(lsNm) {
	var url = "http://oneclick.law.go.kr/CSP/LawLkCsm.laf?LsNm="
			+ encodeURIComponent(lsNm);
	window
			.open(
					url,
					'csmPop',
					'left=0,top=0,menubar=yes,toolbar=yes,location=yes,scrollbars=yes,status=yes,resizable=yes,width=1150px,height=810px');
}

function lsZoomInOut(mode) {
	if (lsVO.updateValue.updateMode != "sideContent") {
		zoomInOut(mode, 'contentBody');
	} else {
		zoomInOut(mode, 'sideCenter');
	}
}

function bylTextFlDownload(bylSeq, bylNo) {
	var frm = el("bylFrm");
	if (frm.childNodes.length > 0) {
		for (var i = 0; i <= frm.childNodes.length; i++) {
			frm.removeChild(frm.childNodes[i]);
		}
	}
	appendInputEl(frm, "hidden", "bylSeq", bylSeq);
	appendInputEl(frm, "hidden", "title", bylNo);
	appendInputEl(frm, "hidden", "mode", "0");
	frm.submit();
}

// 조문 연혁 다른것 항 단위로 처리
function compareLsJo(idName, no) {
	if (lsVO.comparePrevNo > -1) {
		compareLsjoBack(idName, lsVO.comparePrevNo);
		comparePrevNo = -1;
	}
	var html = el(idName + no).innerHTML;
	var prevHtml = "";
	var joList = html.split("<P class=pty1");
	var prevJoList;
	lsVO.comparePrevNo = no;
	var prevNo = no + 1;
	try {
		prevHtml = el(idName + prevNo).innerHTML;
		prevJoList = prevHtml.split("<P class=pty1");
	} catch (e) {
		return false;
	}
	if (joList.length > 0 && prevJoList.length > 0) {
		for (var i = 0; i < joList.length; i++) {
			if (joList[i] != prevJoList[i]) {
				html = html
						.replace(
								joList[i],
								joList[i]
										.replace("name=\"compareLs\">",
												"name=\"compareLs\"><SPAN style=\"BACKGROUND-COLOR: #ffff00\">")
										.replace("</P>", "</SPAN></P>"));
			}
		}
		el(idName + no).innerHTML = html;
	}
}

function compareLsjoBack(idName, no) {
	var html = "";
	html = el(idName + no).innerHTML;
	var joList = html.split("<P class=pty1");
	if (joList.length > 0) {
		for (var i = 0; i < joList.length; i++) {
			html = html
					.replace(
							joList[i],
							joList[i]
									.replace(
											"name=\"compareLs\"><SPAN style=\"BACKGROUND-COLOR: #ffff00\">",
											"name=\"compareLs\">").replace(
											"</SPAN></P>", "</P>"));
		}
	}
	el(idName + no).innerHTML = html;
}

function lsViewWideSide(url, tmpLsiSeq, checkId) {
	fnWestDivChange();
	setDisplay("container8", "block");
	sideInfoView(url, tmpLsiSeq, checkId);
}
/* 본문 이외의 정보 조회 */
function sideInfoView(url, tmpLsiSeq, checkId) {

	var seq = "";
	try {
		if (tmpLsiSeq != null && tmpLsiSeq != "") {
			seq = tmpLsiSeq;

		}

	} catch (e) {
		seq = "";
	}
	if (el("popCheckBox").checked) {
		lsVO.openPopValue.popMode = url;
		fPopContent();
		return "";
	}
	if (seq != "") {
		if (url == 'lsOldAndNew' || url.indexOf('lsOldAndNew') > -1) {
			if (url.indexOf('Prev') > -1) {
				lsVO.lsValue.lsId = el("prevLsId").value;
				lsVO.lsValue.ancYd = el("prevAncYd").value;
				lsVO.lsValue.ancNo = el("prevAncNo").value;
			} else if (url.indexOf('Next') > -1) {
				lsVO.lsValue.lsId = el("nextLsId").value;
				lsVO.lsValue.ancYd = el("nextAncYd").value;
				lsVO.lsValue.ancNo = el("nextAncNo").value;
			} else {
				lsVO.lsValue.lsId = el("lsId").value;
				lsVO.lsValue.ancYd = el("ancYd").value;
				lsVO.lsValue.ancNo = el("ancNo").value;
			}
			url = 'lsOldAndNew';
		} else {
			lsVO.lsValue.lsId = "";
			lsVO.lsValue.ancYd = "";
			lsVO.lsValue.ancNo = "";
		}
		lsVO.bdyUpdValue.updateContentNm = url // 인쇄 저장시 출력 구분하기 위한
		setPopValue(url);
		lsVO.lsValue.lsiSeq = seq;
		el("bodyContentTOP").style.display = "none";
		el("bodySideContent").style.display = "";
		lsVO.conValue.bdyMode = false;
		lsVO.updateValue.updateDiv = "bodySideContent";
		lsVO.updateValue.actionUrl = url + ".do";
		lsVO.updateValue.updateMode = "sideContent";
		lsVO.bdyUpdValue.updateDiv = "";
		// fLsUpd(lsVO);
		fLsUpdate(lsVO.updateValue.updateDiv, lsVO.updateValue.actionUrl,
				makeParam(lsVO.lsValue), lsVO.updateValue.updateMode);
	} else {
		alert(lsVO.msg);
	}
	moveCheckLsNm(checkId);
}

/**
 * <pre>
 * 팝업페이지View호출
 * </pre>
 * @author brKim
 * @since 2017. 8. 31.
 * @param viewCls
 * @param seq
 * @param checkId
 */
function etcView(viewCls, seq, checkId, ancYnChk, efYd, nwJoYnInfo) {


	if (viewCls == "thdCmpScP") {

		lsVO.openPopValue.popCls = "thdCmpScP";

		if (checkId) {
			lsViewAll(seq, efYd, checkId,'','','','',ancYnChk);
		} else {
			lsPopViewAll(seq);
		}

	} else if (viewCls == "thdCmpNewScP") {

		lsVO.openPopValue.popCls = "thdCmpNewScP";

		if (checkId) {
			lsViewAll(seq, efYd, checkId,'','','','',ancYnChk);
		} else {
			lsViewAll(seq, efYd, checkId, '0000','','','',ancYnChk);
		}

	} else if (viewCls == "lsOldAndNew") {

		lsVO.openPopValue.popCls = "lsOldAndNew";

		if (checkId) {
			lsViewAll(seq, efYd, checkId,'','','','',ancYnChk);
		} else {
			lsPopViewAll(seq);
		}

	} else if (viewCls == "lsRvsDocInfoR") {

		lsVO.openPopValue.popCls = "lsRvsDocInfoR";

		if (checkId) {
			lsViewAll(seq, efYd, checkId, '', '', nwJoYnInfo, '', ancYnChk);
		} else {
			lsPopViewAll(seq);
		}
	} else if (viewCls == "engLsInfoR") {

		lsVO.openPopValue.popCls = "engLsInfoR";

		if (checkId) {
			lsViewAll(seq, efYd, checkId, '010203','','','','',ancYnChk);
		} else {
			lsPopViewAll(seq, efYd);
		}
	} else if (viewCls == "lsRvsOnlyDocInfoR") { // 제개정 문만..

		lsVO.openPopValue.popCls = "lsRvsOnlyDocInfoR";

		if (checkId) {
			lsViewAll(seq, efYd, checkId,'','','','',ancYnChk);
		} else {
			lsPopViewAll(seq);
		}

	} else if (viewCls == "lsRvsOnlyRsnInfoR") { // 제개정문 이유만..

		lsVO.openPopValue.popCls = "lsRvsOnlyRsnInfoR";

		if (checkId) {
			lsViewAll(seq, efYd, checkId,'','','','',ancYnChk);
		} else {
			lsPopViewAll(seq);
		}
	} else if (viewCls == "lsPtnThdCmp") {

		lsVO.openPopValue.popCls = "lsPtnThdCmp";

		lsViewAll(seq, efYd, checkId, '0000', '', '', '010202',ancYnChk);

	}

}

/* 본문 이외의 정보 조회(팝업불러올때-시행일자 있을경우) 본뮨 상단 제개정이유 버튼 클릭시 HTML 경로세팅 위해 ancYnChk, efGubun 추가*/
function etcViewNw(viewCls, seq, efYd, checkId, ancYnChk, efGuBun, nwJoYnInfo) {
	var nwYnCd = "";
	if(nwJoYnInfo == "Y"){
		nwYnCd = 3;
	}
	if (viewCls == "thdCmpScP") {
		lsVO.openPopValue.popCls = "thdCmpScP";

		if (checkId != null) {
			lsViewAll(seq, checkId);

		} else {
			lsPopViewAll(seq);
		}

	} else if (viewCls == "thdCmpNewScP") {
		lsVO.openPopValue.popCls = "thdCmpNewScP";

		if (checkId != null) {
			lsViewAll(seq, checkId);

		} else {
			lsPopViewAll(seq);
		}

	} else if (viewCls == "lsOldAndNew") {
		lsVO.openPopValue.popCls = "lsOldAndNew";

		if (checkId != null) {
			lsViewAll(seq, efYd, checkId,'','','','',ancYnChk);

		} else {
			lsPopViewAll(seq, efYd);
		}

	} else if (viewCls == "lsRvsDocInfoR") {
		lsVO.openPopValue.popCls = "lsRvsDocInfoR";

		if (checkId != null) {//HTML 경로세팅 위해서 ancYnChk, efGuBun 추가
			lsViewAll(seq, efYd, checkId, '', '', nwYnCd, '', ancYnChk ,efGuBun);

		} else {
			lsPopViewAll(seq, efYd);
		}
	} else if (viewCls == "engLsInfoR") {
		lsVO.openPopValue.popCls = "engLsInfoR";

		if (checkId != null) {
			lsViewAll(seq, checkId, '010203');

		} else {
			lsPopViewAll(seq, '010203');
		}
	} else if (viewCls == "lsRvsOnlyDocInfoR") { // 제개정 문만..
		lsVO.openPopValue.popCls = "lsRvsOnlyDocInfoR";

		if (checkId != null) {
			lsViewAll(seq, checkId);

		} else {
			// 파라미터에 시행일 추가
			lsPopViewAll(seq, efYd);
		}
	} else if (viewCls == "lsRvsOnlyRsnInfoR") { // 제개정문 이유만..
		lsVO.openPopValue.popCls = "lsRvsOnlyRsnInfoR";

		if (checkId != null) {
			lsViewAll(seq, checkId);

		} else {
			// 파라미터에 시행일 추가
			lsPopViewAll(seq, efYd);
		}
	}

}

var arGoView = "";

function focusMulti2(target, lsiSeq, gubun) {
	var tmpVal = target.substring(1, target.length);

	for (i = 0; i < els("lsAr").length; i++) {
		els("lsAr")[i].style.fontWeight = "";
	}

	el("J" + target).style.fontWeight = "bold";

	if (el("lsiSeq").value != lsiSeq) {
		arGoView = target;

		lsViewAll(lsiSeq, gubun);

	} else {
		if (el("bodyContentTOP").style.display != "none") {
			document.location.href = "#" + target;

		} else {
			document.location.href = "#E" + target;
		}

		if (el("ar" + tmpVal).style.display != "")
			arView("ar" + tmpVal);
	}
}

function showHstDiv(on, off) {
	el("lsHstDiv" + on).style.display = 'block';
	el("hstBtn" + on).className = 'on';
	el("lsHstDiv" + off).style.display = 'none';
	el("hstBtn" + off).className = '';
}

function setLsExtraDivs() {
	// 법령 부칙 모두 닫기, 아이콘 바꾸기 2010 10 29
	var arSeqs = document.getElementsByName("arInf");
	for (var i = 0; i < arSeqs.length - 1; i++) { // arSeqs.length
		var arSeq = arSeqs[i].value;
		if (el("ar" + arSeq) != null) {
			el("ar" + arSeq).style.display = "none";
			el("ar" + arSeq + "btn").src = "/LSW/images/button/btn_coop.gif";
		}
	}
	// 영문법령 부칙 모두 닫기, 아이콘 바꾸기 2010 10 15
	var engArSeqs = document.getElementsByName("engArSeqs");
	for (var i = 0; i < engArSeqs.length - 1; i++) { // engArSeqs.length
		var engArSeq = engArSeqs[i].value;
		if (el("engar" + engArSeq) != null) {
			el("engar" + engArSeq).style.display = "none";
			el("engar" + engArSeq + "btn").src = "/LSW/images/button/btn_coop.gif";
		}
	}
	// 영문법령 별표/서식 아이콘 바꾸기 2010 10 15
	var engBylBtns = document.getElementsByName("engbylbtns");
	for (var i = 0; i < engBylBtns.length; i++) { // engBylBtns.length
		engBylBtns[i].src = "/LSW/images/button/btn_coop.gif";
	}

}

function fPopSelContent() {
	var url = "lsSelCmpInfoP";
	var params = "";

	openPop(url + ".do?lsiSeq=" + lsVO.lsValue.lsiSeq + "&lsId="
			+ lsVO.lsValue.lsId + "&chrClsCd=" + lsVO.lsValue.chrClsCd
			+ "&urlMode=" + lsVO.openPopValue.popMode + params, "960px",
			"600px");
}

// 제개정문보기
function fRvsDonRsnView() {
	if (el("rvsDonRsnArea").style.display == "block") {
		el("rvsDonRsnArea").style.display = "none";
		el("rvsDonRsnImgOpn").src = el("rvsDonRsnImgOpn").src.replace(
				"btn_fold.gif", "btn_allview.gif");
		el("rvsDonRsnImgOpn").alt = "제개정문보기";
	} else {
		el("rvsDonRsnArea").style.display = "block";
		el("rvsDonRsnImgOpn").src = el("rvsDonRsnImgOpn").src.replace(
				"btn_allview.gif", "btn_fold.gif");
		el("rvsDonRsnImgOpn").alt = "제개정문닫기";
	}
}

function lsCalDateInfo(calDt, cd, gubun) { // 달력해당일법령정보
	if (cd == 'main') {
		lsVO.updateValue.actionUrl = "calendarMainListR.do";
		lsVO.updateValue.updateDiv = "calendarMainList";
		lsVO.lsValue.calDt = calDt;
		lsVO.updateValue.updateMode = "bdy";
		lsVO.lsValue.fsort = cd;
		lsVO.lsValue.gubun = gubun;
	} else {
		lsVO.updateValue.actionUrl = "calendarInfoR.do";
		lsVO.updateValue.updateDiv = "bodyContent2";
		lsVO.lsValue.calDt = calDt;
		lsVO.updateValue.updateMode = "bdy";
		lsVO.lsValue.fsort = cd;
		lsVO.lsValue.gubun = gubun;
	}
	fLsUpdate(lsVO.updateValue.updateDiv, lsVO.updateValue.actionUrl,
			makeParam(lsVO.lsValue), lsVO.updateValue.updateMode);
}

// 법령단위비교추가
function s_layoutMove(f_type) {
	if (!f_type) {
		document.getElementById("Maximize").style.display = 'none';
		document.getElementById("Minimize").style.display = '';
		jo_show('H');

	} else {
		document.getElementById("Maximize").style.display = '';
		document.getElementById("Minimize").style.display = 'none';
		jo_show('S');

	}
}

var jo_div = new Array();
var jo_divlen = 0;
var modalwindowDoc;
var gAllHTML1 = "", gAllHTML2 = "";

function logdiv_write(s1) {
	// return;
	var s = document.getElementById("logdiv").innerHTML;

	s = s + "<BR/>" + s1;
	document.getElementById("logdiv").innerHTML = s;
}

function jo_show(ptype) {
	var iPos = 0;
	var oObj = document.getElementsByName('njx');

	for (iPos = 0; iPos < oObj.length; iPos++) {

		if (ptype == "S")
			oObj[iPos].style.display = "inline";
		if (ptype == "H")
			oObj[iPos].style.display = "none";
	}

}

function jo_changeALL(pStype, lsID) { // 새로운 조번호로 변경
	jo_change_reg('O', pStype, 1);
	jo_change_reg('R', pStype, 2);

	var divEle = document.getElementById("thdCmpTab");

	if (pStype == 1) {

		divEle.innerHTML = "<a href='#AJAX' id='JoCmp' onclick=\"fThdCmpLsPop1('JO', '"
				+ lsID
				+ "');\">3단비교(법률기준)</a><a href='#AJAX' id='AddCmp' onclick=\"fThdCmpLsPop1('ADD', '"
				+ lsID
				+ "');\">3단비교</a><a href='#AJAX' id='LsCmp' onclick=\"fThdCmpLsPop1('LS' , '"
				+ lsID
				+ "');\">법령단위비교</a><a href='#AJAX' id='JoCmpNew1' onclick=\"jo_changeALL('1', '"
				+ lsID
				+ "');\"  class='on'>조문연계3단 비교-1</a><a href='#AJAX' id='JoCmpNew2' onclick=\"jo_changeALL('2', '"
				+ lsID + "');\">조문연계3단 비교-2</a>	";

	} else if (pStype == 2) {

		divEle.innerHTML = "<a href='#AJAX' id='JoCmp' onclick=\"fThdCmpLsPop1('JO', '"
				+ lsID
				+ "');\">3단비교(법률기준)</a><a href='#AJAX' id='AddCmp' onclick=\"fThdCmpLsPop1('ADD', '"
				+ lsID
				+ "');\">3단비교</a><a href='#AJAX' id='LsCmp' onclick=\"fThdCmpLsPop1('LS' , '"
				+ lsID
				+ "');\">법령단위비교</a><a href='#AJAX' id='JoCmpNew1' onclick=\"jo_changeALL('1', '"
				+ lsID
				+ "');\"  >조문연계3단 비교-1</a><a href='#AJAX' id='JoCmpNew2' onclick=\"jo_changeALL('2', '"
				+ lsID + "');\" class='on'>조문연계3단 비교-2</a>	";

	}
}

function jo_cvt(pType, pJoStr) {

	var jo_O_data = new Array("", "1-1", "2-1", "2-2", "2-3", "2-4", "5-1",
			"5-2", "6-1", "6-2", "6-3", "8-1", "8-2", "8-3", "8-4", "8-5",
			"8-6", "8-7", "9-1", "10-1", "10-2", "10-3", "10-4", "10-5",
			"10-6", "11-1", "12-1", "13-1", "15-1", "16-1", "17-1", "21-1",
			"23-1", "24-1", "26-1", "26-2", "26-3", "26-4", "26-5", "26-6",
			"26-7", "26-8", "26-9", "26-10", "26-11", "26-12", "26-13",
			"26-14", "26-15", "27-1", "27-2", "27-3", "27-4", "27-5", "27-6",
			"27-7", "27-8", "28-1", "28-2", "29-1", "29-2", "29-3", "29-4",
			"29-5", "29-6", "29-7", "29-8", "32-1", "32-2", "32-3", "32-4",
			"33-1", "35-1", "36-1", "39-1", "39-2", "39-3", "39-4", "39-5",
			"39-6", "39-7", "40-1", "40-2", "41-1", "42-1", "43-1", "44-1",
			"45-1", "46-1", "47-1", "48-1", "49-1", "51-1", "51-2", "51-3",
			"52-1", "53-1", "54-1", "54-2", "54-3", "55-1", "56-1", "57-1",
			"57-2", "57-3", "58-1", "59-1", "59-2", "60-1", "61-1", "62-1",
			"63-1", "64-1", "65-1", "66-1", "69-1", "70-1", "71-1", "73-1",
			"74-1", "74-2");

	var jo_R_data = new Array("", "1-1-1", "2-2-1", "6-1-1", "6-1-2", "6-1-3",
			"6-1-4", "6-2-1", "6-3-1", "8-1-1", "8-3-1", "8-4-1", "8-4-2",
			"8-4-3", "8-7-1", "9-1-1", "10-5-1", "15-1-1", "15-1-2", "16-1-1",
			"16-1-2", "21-1-1", "24-1-1", "24-1-2", "26-1-1", "26-4-1",
			"26-5-1", "26-7-1", "26-7-2", "26-9-1", "26-9-2", "26-9-3",
			"26-9-4", "26-9-5", "26-12-1", "26-13-1", "26-15-1", "27-1-1",
			"27-2-1", "27-3-1", "27-3-2", "27-3-3", "27-8-1", "27-8-2",
			"28-1-1", "28-2-1", "29-7-1", "29-7-2", "29-7-3", "32-1-1",
			"32-2-1", "32-3-1", "33-1-1", "36-1-1", "40-1-1", "41-1-1",
			"42-1-1", "43-1-1", "43-1-2", "44-1-1", "45-1-1", "47-1-1",
			"48-1-1", "51-1-1", "51-2-1", "51-3-1", "52-1-1", "54-1-1",
			"55-1-1", "56-1-1", "59-2-1", "61-1-1", "64-1-1", "65-1-1",
			"66-1-1", "70-1-1", "71-1-1", "73-1-1");

	var sJo = ""; // 조번호
	var sJoNew = ""; // 새로운 조번호
	var iJo = 0; // 조번호
	var jo_data; // 배열

	if (pType == "O") { // 시행령
		jo_data = jo_O_data;
	}
	if (pType == "R") { // 시행규칙
		jo_data = jo_R_data;
	}

	sJo = pJoStr.replace("제", "").replace("조", "");

	sJoNew = "제" + jo_data[parseInt(sJo)] + "조";

	return sJoNew

}

function jo_newHtml(pJoStr, pNewJoStr, pStyle) {
	var s2 = "";
	var sNewjoHtml = "";

	if (pStyle == "1") {
		s2 = "현행 [" + pJoStr + "]";
		sNewjoHtml = "<span  class='nj' title='" + s2 + "' >" + pNewJoStr
				+ "</span>";
	}
	if (pStyle == "2") {
		s2 = "(현행 " + pJoStr + ")";
		sNewjoHtml = "<span  class='nj' >" + pNewJoStr + s2 + "</span>";
	}
	return sNewjoHtml;
}

function jo_change_reg(pType, pStyle, pOrder) { // 정규표현식 조번호 변경
	var s1 = "";
	var sAllHtml = ""; // 전체 html
	var sAllHtmlNew = ""; // 수정된전체 html
	var iPos = 0; // 반복용
	var sRgExp = ""; // 조제목의 조번호가 포함된 html 를 찾는 정규식
	var raHeadHtml; // 정규식 결과
	var sHeadHtml = ""; // 조제목의 조번호가 포함된 html
	var sHeadHtmlNew = ""; // 조제목의 조번호가 포함된 html

	var iPosJo = 0; // 반복용
	var sRgExpJo = ""; // 조제목의 조번호가 포함된 html 를 찾는 정규식
	var raJo; // 정규식 결과
	var sJoStr = ""; // 조번호가 들어있는 문자
	var sNewJoStr = ""; // 변경된 조

	var sJoStrEx = ""; // 제외 패턴
	var sNewJoHtml = ""; // 변경된 최종 조 HTML

	if (gAllHTML1 == "")
		gAllHTML1 = document.body.innerHTML;
	sAllHtml = gAllHTML1;
	if (pOrder == 2)
		sAllHtml = gAllHTML2;

	sAllHtmlNew = sAllHtml;

	// ------------------------------------------
	// ------------------------------------------ 시행령 조제목의 조문번호 변경
	// ------------------------------------------

	sRgExp = /(\#O.*?제[0-9]+조\()/g;
	if (pType == "O")
		sRgExp = /(\#O.*\s+.*\s+.*제[0-9]+조\()/g;
	if (pType == "R")
		sRgExp = /(\#R.*\s+.*\s+.*제[0-9]+조\()/g;
	if (pType == "O")
		sRgExp = /(\#O.*?제[0-9]+조\()/g;
	if (pType == "R")
		sRgExp = /(\#R.*?제[0-9]+조\()/g;
	sRgExpJo = /(제[0-9]+조)/g;

	raHeadHtml = sAllHtml.match(sRgExp);
	// logdiv_write( "일치한 갯수:" + raHeadHtml.length );

	for (iPos = 0; iPos < raHeadHtml.length; iPos++) {
		sHeadHtml = raHeadHtml[iPos];
		raJo = sHeadHtml.match(sRgExpJo);
		sJoStr = raJo[0];
		sNewJoStr = jo_cvt(pType, sJoStr); // ------------- 이전 조문번호를 새로운 조문번호로
		// 변경
		sNewJoHtml = jo_newHtml(sJoStr, sNewJoStr, pStyle); // -----------------
		// 새로운 조문번호를 html
		// 형태로 생성
		sHeadHtmlNew = sHeadHtml.replace(sJoStr, sNewJoHtml);
		sAllHtmlNew = sAllHtmlNew.replace(sHeadHtml, sHeadHtmlNew);
		logdiv_write("변경[" + iPos + "]" + sJoStr + "=>" + sNewJoStr);
	}
	document.body.innerHTML = sAllHtmlNew;

	// ------------------------------------------
	// ------------------------------------------ 시행령 조내용의 조문번호 변경
	// ------------------------------------------
	sAllHtml = document.body.innerHTML;
	sAllHtmlNew = sAllHtml;

	sRgExp = /(divO.*?<\/span>)/g;
	if (pType == "O")
		sRgExp = /(divO.*?<\/span>)/ig;
	if (pType == "R")
		sRgExp = /(divR.*?<\/span>)/ig;
	sRgExpJo = /(제[0-9]+조)/g;

	raHeadHtml = sAllHtml.match(sRgExp);
	if (raHeadHtml != null) {
		logdiv_write("일치한 갯수:" + raHeadHtml.length);

		for (iPos = 0; iPos < raHeadHtml.length; iPos++) {
			sHeadHtml = raHeadHtml[iPos];
			raJo = sHeadHtml.match(sRgExpJo);
			// if( ("」 "== s2) || ("법 "== s2) || (") "== s2) ) {
			if (raJo != null) {
				for (iPosJo = 0; iPosJo < raJo.length; iPosJo++) {
					sJoStr = raJo[0];
					sJoStrEx = "";
					if (pType == "O") {
						if (sHeadHtml.indexOf("법 " + sJoStr) >= 0)
							sJoStrEx = "법";
						if (sHeadHtml.indexOf(") " + sJoStr) >= 0)
							sJoStrEx = ")";
						if (sHeadHtml.indexOf("」 " + sJoStr) >= 0)
							sJoStrEx = "」";
					}
					if (pType == "R") {
						if (sHeadHtml.indexOf("법 " + sJoStr) >= 0)
							sJoStrEx = "법";
						if (sHeadHtml.indexOf("영 " + sJoStr) >= 0)
							sJoStrEx = "영";
						if (sHeadHtml.indexOf(") " + sJoStr) >= 0)
							sJoStrEx = ")";
						if (sHeadHtml.indexOf("」 " + sJoStr) >= 0)
							sJoStrEx = "」";
						if (sHeadHtml.indexOf("」(이하 \"영\"이라 한다) " + sJoStr) >= 0)
							sJoStrEx = "영";
					}
					if (pType == "R" && sJoStrEx == "영") { // ---------------
						// 시행규칙을 변경하다 영
						// 제OO조가 나오면 영의
						// 신규조문번호로 변경
						sNewJoStr = jo_cvt("O", sJoStr); // ------------- 이전
						// 조문번호를 새로운 조문번호로
						// 변경
						sNewJoHtml = jo_newHtml(sJoStr, sNewJoStr, pStyle); // -----------------
						// 새로운
						// 조문번호를
						// html
						// 형태로
						// 생성
						sHeadHtmlNew = sHeadHtml.replace(sJoStr, sNewJoHtml);
						sAllHtmlNew = sAllHtmlNew.replace(sHeadHtml,
								sHeadHtmlNew);
						logdiv_write("변경 조[" + iPos + "]조내용[" + iPosJo + "]"
								+ sJoStr + "=>" + sNewJoStr);
					}
					if (sJoStrEx == "") {
						sNewJoStr = jo_cvt(pType, sJoStr); // ------------- 이전
						// 조문번호를 새로운 조문번호로
						// 변경
						sNewJoHtml = jo_newHtml(sJoStr, sNewJoStr, pStyle); // -----------------
						// 새로운
						// 조문번호를
						// html
						// 형태로
						// 생성
						sHeadHtmlNew = sHeadHtml.replace(sJoStr, sNewJoHtml);
						sAllHtmlNew = sAllHtmlNew.replace(sHeadHtml,
								sHeadHtmlNew);
						logdiv_write("변경 조[" + iPos + "]조내용[" + iPosJo + "]"
								+ sJoStr + "=>" + sNewJoStr);
					}
				} // iPosJo
			} // if
		}
	} // if not null

	document.body.innerHTML = sAllHtmlNew;
	gAllHTML2 = document.body.innerHTML;
}

/**
 * <pre>
 * 	언어 변환 (한자<->한글)
 * </pre>
 * @author brKim
 * @since 2017. 10. 16.
 */

var sParam = {lsId:"", 
	lsThdCmpCls : "",
	t1LsThdCmpRlatLsSeq : "",
	t2LsThdCmpRlatLsSeq : "",
	t3LsThdCmpRlatLsSeq : "",
	thdCmpEdtGb : "",
	usrThdCmpSeq : "",
		chrClsCd:""};

function chrChange(obj) {

	// 영문법령 클릭 시
	if (lsVO.updateValue.actionUrl.indexOf("engLsInfoR") > -1) {
		alert("영문법령에서는 지원하지 않습니다.");
	} else if (lsVO.bdyUpdValue.updateContentNm == 'lumThdCmp') {
		if (sParam.chrClsCd == '010202') {
			sParam.chrClsCd = '010201';
		} else {
			sParam.chrClsCd = '010202';
		}
//		fn_moveThdCmp('THDCMP', sParam.lsId, sParam.t1LsThdCmpRlatLsSeq, sParam.t2LsThdCmpRlatLsSeq, sParam.t3LsThdCmpRlatLsSeq, sParam.lsThdCmpCls, sParam.thdCmpEdtGb, sParam.usrThdCmpSeq);
		chgChrImg(obj);
	} else if (lsVO.bdyUpdValue.updateContentNm == 'lumThdCmpSc') {
		if (sParam.chrClsCd == '010202') {
			sParam.chrClsCd = '010201';
		} else {
			sParam.chrClsCd = '010202';
		}
//		fn_moveThdCmp('LSCOMPARE', sParam.lsId, sParam.t1LsThdCmpRlatLsSeq, sParam.t2LsThdCmpRlatLsSeq, sParam.t3LsThdCmpRlatLsSeq, sParam.lsThdCmpCls, sParam.thdCmpEdtGb, sParam.usrThdCmpSeq);
		chgChrImg(obj);
	} else if (lsVO.bdyUpdValue.updateContentNm == 'thdCmpNew') {
		if (sParam.chrClsCd == '010202') {
			sParam.chrClsCd = '010201';
		} else {
			sParam.chrClsCd = '010202';
		}

//		if (popParam.lsId != '') {
//			fThdCmpLsPop1('JO', popParam.lsId);
//		} else {
//			fThdCmpLsPop1('JO', sParam.lsId);
//		}

		chgChrImg(obj);
	} else if (lsVO.bdyUpdValue.updateContentNm == 'lsPtnThdCmp') {
		if (sParam.chrClsCd == '010202') {
			sParam.chrClsCd = '010201';
		} else {
			sParam.chrClsCd = '010202';
		}

		if (popParam.lsId != '') {
			fn_moveThdCmp('LSPTNTHDCMP', popParam.lsId);
		} else {
			fn_moveThdCmp('LSPTNTHDCMP', sParam.lsId);
		}

		chgChrImg(obj);
	} else {
		if (lsVO.conValue.bdyMode) { // 본문 언어 타입 저장

			lsVO.lsValue.chrClsCd = lsVO.conValue.bdyLangType;

			if (!lsVO.lsValue.chrClsCd) {
				lsVO.lsValue.chrClsCd = "010202"; // 값이 없을 경우 한글로 세팅
			}
		}

		if (lsVO.lsValue.chrClsCd == '010202') {
			lsVO.lsValue.chrClsCd = '010201';
			$('#lsBdyChrCls').val('010201');
			
		} else {
			lsVO.lsValue.chrClsCd = '010202';
			$('#lsBdyChrCls').val('010202');
		}

		fLsUpd(lsVO);

		chgChrImg(obj);
	}
}

/**
 * <pre>
 * 	영문법령 본문 조회
 *  2018.12.06. 2018 국가법령 - 영문, 한글 본문 변환시 화면내 검색 초기화
 * </pre>
 * @author brKim
 * @since 2017. 12. 20.
 * @param obj
 */
function engBdyChange(obj)
{
	// 화면내 검색 닫기
	firstSearchFlag = true;
	SaveWindow.hideBdySearch();
	searchLayer.hiddenSearchLayer();

	/* 본문을 한글 법령으로 변경
	// 토글 여부
	lsVO.engBdyToggle(obj);

	// 한글을 조회하는 순간 다음부터는 div 토글만 한다.
	if (!lsVO.getBdySchChk()) {
		bdyChange(true);
		lsVO.bdySchChk = true;
	}
	*/
	
	//팝업으로 한글 법령 호출
	lsVO.lsValue.chrClsCd = lsVO.LangType; // 기본 언어 설정
	setPopValue("lsInfoP");
	fPopContent();

}

/**
 * <pre>
 * 	한글 <-> 한자 이미지 변환
 * </pre>
 * @author brKim
 * @since 2017. 12. 20.
 */
function chgChrImg(obj) {
	// 한자, 한글 변환
	var langType = $(obj).find('img').attr('alt');
	if (langType === '한자') {
		$('#langType').find('img').attr('alt', '한글');
		$('#langType').find('img').attr('src', webRoot + '/images/common/btn_v13fn10_1.png');
	} else if (langType === '한글') {
		$('#langType').find('img').attr('alt', '한자');
		$('#langType').find('img').attr('src', webRoot + '/images/common/btn_v13fn5_1.png');
	}
}

// 조문이동
function lsJoMove(obj) {

	var target = obj.value;

	if (target != '') {
		document.location.href = "#" + target;
	}
}

/**
 * <pre>
 * 3단비교 사이즈 조절
 * </pre>
 * @author dsKim
 * @since 2018. 3. 5.
 */
function thdCmpNewScPResize() {
	// 메인타이틀 상단까지의 높이
	var popHeight = $(window).height();
	var mainTitle = $("#theadDiv").height();
	var divHight = popHeight - mainTitle - 131;
	$("#divThreeCmp").css("height", divHight);

	// 상단 부분은 리사이징하지않고 고정
}


function lsInfo(obj){
	var ret = new Object();
	var rect = obj.getBoundingClientRect();
	var leftObj = leftListWidthGet(); 
    ret.left = rect.left + (document.documentElement.scrollLeft || document.body.scrollLeft); 
    document.getElementById('lsScInfo_3').style.display = "none";
    var tempNum = 'lsScInfo_3'; // 좌측 카테고리의 보여줄 번호를 뿌려준다.
	var lsView = document.getElementById(tempNum);
	var ua = navigator.userAgent.toLowerCase();
	// 첫번째 버튼의 기준으로 위치를 잡는다. (좌측 목록의 리스트를 객체로 가져와서)
	lsView.style.left = ret.left-leftObj.width+"px";
	lsView.style.display = "block";		
}

function lsInfoClose(){
	document.getElementById('lsScInfo_3').style.display = "none";
}

/* 한눈법령조문 레이어 */
var oneViewLayer = (function() {
	var oneViewLayer = null;
	return {
		showOneViewLayer : function(joNo, joBrNo) {
			var title =	'<div class="vwrap_tit">'
					+'  <h5 class="vw_s_tit"><span>한눈보기 서비스 제공 조문</span></h5>'
					+'  <a href="#" onclick="oneViewLayer.hiddenOneViewLayer(joNo, joBrNo);" class="btn_vw_clse">닫기</a>'
					+'</div>';

			oneViewLayer = $("#oneViewLayer").dialog({
				autoOpen : false
					,modal : false
					,resizable: false
					,width: '275px'
					,title : title
					,position : {
						// 내 객체 위치
						my : 'left top',
						// 참조할 객체 위치
						at : 'left top',
						// 참조할 객체 지정
						of : $('#leftContent')
					}
			});

			if (joNo != null && joBrNo != null) {
				const divElement = document.getElementById('J'+Number(joNo)+":"+Number(joBrNo)).nextElementSibling;
				var oneViewElement = divElement.getElementsByClassName('oneView');
				for (var i=0; i < oneViewElement.length; i++) {
					oneViewElement[i].style.textDecorationLine = '';
					oneViewElement[i].style.pointerEvents = '';
					oneViewElement[i].style.cursor = 'pointer';
					oneViewElement[i].style.backgroundColor = 'rgb(255, 228, 0)';
				}
			} else {
				$(".oneView").each(function(){
					$(this).css('text-decoration-line', '');
					$(this).css('pointer-events', '');
					$(this).css('cursor', 'pointer');
					$(this).css("background-color", "rgb(255, 228, 0)");
				});
			}

			oneViewLayer.dialog("open");
		}
		,hiddenOneViewLayer : function(joNo, joBrNo){
			if (oneViewLayer) {
				oneViewLayer.dialog("close");
				$("#oneViewLayer").empty();
				if (joNo != null && joBrNo != null) {
					const divElement = document.getElementById('J'+Number(joNo)+":"+Number(joBrNo)).nextElementSibling;
					var oneViewElement = divElement.getElementsByClassName('oneView');
					for (var i=0; i < oneViewElement.length; i++) {
						oneViewElement[i].style.textDecorationLine = 'none';
						oneViewElement[i].style.pointerEvents = 'none';
						oneViewElement[i].style.cursor = 'default';
						oneViewElement[i].style.backgroundColor = '';
					}
				} else {
					$(".oneView").each(function () {
						$(this).css('text-decoration-line', 'none');
						$(this).css('pointer-events', 'none');
						$(this).css('cursor', 'default');
						$(this).css("background-color", "");
						//$(this).after($(this).text());
						//$(this).remove();
					});
				}
			}
			if (joNo != null && joBrNo != null) {
				$("#oneViewBtn"+joNo+joBrNo).attr("onclick","javascript:showOneView(this,'"+joNo+"','"+joBrNo+"'); return false;");
			}
			$("#oneViewBtn").attr("onclick","javascript:showOneView(this); return false;");
		}
	};
})();

//한눈보기 클릭시 레이어롤 표시한다.
function showOneView(obj, joNo, joBrNo){
	var oneViewValueObj = function(){				// 법령정보 Obj
		this.oneViewVal = {lsiSeq : ""},
		this.oneViewVal = {efYd : ""};
	};

	var oneViewVO = new oneViewValueObj();
	oneViewVO.oneViewVal.lsiSeq =  $("#lsiSeq").val();
	oneViewVO.oneViewVal.efYd =  $("#efYd").val();
	if (joNo != null && joBrNo != null) {
		oneViewVO.oneViewVal.joNo =  joNo;
		oneViewVO.oneViewVal.joBrNo =  joBrNo;
	}
	oneViewLayer.hiddenOneViewLayer();

	$.ajax({
		url: "oneVIewList.do"
		,data: makeParam(oneViewVO.oneViewVal)
		,success : function(data, st) {

			var oneVIewList = data.oneViewList;
			var oneViewLayerText = "";
			var oneViewText = "";
			var firstFocus = "";

			if(oneVIewList.length > 0){
				oneViewLayerText = "<div>";
				oneViewLayerText += "    <div class='vwrap2' style='left:3px;top:32px;'>";
				oneViewLayerText += "        <div class='viewla' style='width:270px;'>";
				oneViewLayerText += "            <div class='ins'style='overflow:auto;'>";
				oneViewLayerText += "                <table class='unOrdinJo_Dele'>";
				oneViewLayerText += "                    <colgroup>";
				oneViewLayerText += "                        <col width='65px' />";
				oneViewLayerText += "                        <col width='160'px' />";
				oneViewLayerText += "                    </colgroup>";
				oneViewLayerText += "                    <tbody>";
				for(var i=0; i<oneVIewList.length; i++){
					var strJoNo = "J"+Number(oneVIewList[i].joNo)+"\\:"+Number(oneVIewList[i].joBrNo);
					if(i == 0){
						firstFocus = "J"+Number(oneVIewList[i].joNo)+":"+Number(oneVIewList[i].joBrNo);
					}
					var joTtl = "";
					if(oneVIewList[i].joTtl != null){
						joTtl = oneVIewList[i].joTtl;
					}

					oneViewText = "";
					oneViewLayerText += "                        <tr>";
					oneViewLayerText += "                            <td class='joNo'>";
					oneViewLayerText += "                                <a href='#' onclick='javascript:focusMulti(\""+strJoNo+"\"); oneViewImg(\"" + oneVIewList[i].oneviewPttninfSeq + "\");'>";
					oneViewLayerText += "                                " + "제" + Number(oneVIewList[i].joNo) + "조";
					if(oneVIewList[i].joBrNo != "00"){
						oneViewLayerText += "의" + Number(oneVIewList[i].joBrNo);
					}
					oneViewLayerText += "                               </a>";
					oneViewLayerText += "                            </td>";
					oneViewLayerText += "                            <td class='joTtl'>";
					oneViewLayerText += "                               <a href='#' onclick='javascript:focusMulti(\""+strJoNo+"\"); oneViewImg(\"" + oneVIewList[i].oneviewPttninfSeq + "\");'>";
					oneViewLayerText += "                                "+ joTtl + " (" + oneVIewList[i].descText + ")";
					oneViewLayerText += "                               </a>";
					oneViewLayerText += "                            </td>";
					oneViewLayerText += "                        </tr>";
				}
				oneViewLayerText += "                     </tbody>";
				oneViewLayerText += "                 </table>";
				oneViewLayerText += "            </div>";
				oneViewLayerText += "        </div>";
				oneViewLayerText += "    </div>";
				oneViewLayerText += "</div>";
			}

			$("#oneViewLayer").html(oneViewLayerText);
			if (joNo != null && joBrNo != null) {
				oneViewLayer.showOneViewLayer(joNo, joBrNo);
			} else {
				oneViewLayer.showOneViewLayer();
				$("#oneViewBtn").attr("onclick","oneViewLayer.hiddenOneViewLayer();");
			}

			$("#oneViewLayer").show();
//                focusMulti(firstFocus);
		}
	});
}

//한눈보기 레이어에서 클릭시 한눈보기 이미지 팝업을 연다.
function oneViewImg(oneviewPttninfSeq){
	var width = 680;
	var height = 823;
	var sw  = (document.body.offsetWidth) - width;
	var sh = 0;
	var url = "oneViewImg.do?oneviewPttninfSeq="+oneviewPttninfSeq+"&flGubun=1";
	window.open(url,'', 'left='+sw+', top='+sh+', scrollbars=yes,toolbar=no,resizable=yes,status=no,menubar=no,width='+width+'px,height='+height+'px');
}

function customResizePop() {
	var $contentHeight = $("#center").height() - ($('.body_top_area').height() + 13);
	var $conTopHeight = $('#conTop').height() + 25;

	var bdyValue = lsVO.bdyUpdValue.updateContentNm || 'lsBdy';

	if (bdyValue == 'lsBdy') {
		/* 본문에서는 법령명 고정 때문에 hidden 처리*/

		$('#bodyContentTOP > #viewwrapCenter').height($contentHeight);
		$('#conScroll').height($('#viewwrapCenter').height() - $conTopHeight);
		if($('#viewwrapCenter2').height() != null){
			$('#bodyContentTOP > #viewwrapCenter2').height($contentHeight);
			$('#conScroll').height($('#viewwrapCenter2').height() - $conTopHeight);
		}
		$('#bodyContent').css('width', 'inherit');

	} else if (bdyValue == 'lsPtnThdCmp') {
		lspttnThdCmpResize();
	} else if (bdyValue == 'lumThdCmp') {
		thdCmpNewScPResize();
	} else if (bdyValue == 'lumThdCmpSc') {

	} else if (bdyValue == 'thdCmpNew') {

	} else if (bdyValue == 'lsOldAndNew') {
		// 신구법은 이전 이후 버튼 높이까지 마이너스 한다.
		$('#bodySideContent > #oldAndNewDiv').height(($contentHeight + $('#tmpWidth').height()-114));
	} else if (bdyValue == 'lsRvsDocInfoR') {

		$('#bodySideContent > #viewwrapCenter').height($contentHeight);
		$('#conScroll').height($('#viewwrapCenter').height() - $conTopHeight);
		$('#conTop').height($('.cont_top').height());
		$('#rvsConScroll').height($('#viewwrapCenter').height() - $('#rvsConTop').height());

	} else {
		$('#bodySideContent > #viewwrapCenter').height($contentHeight);
	}
}