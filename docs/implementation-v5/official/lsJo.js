/**
 * <pre>
 *  lsJo.js
 *  </pre>
 *  history :  2017.11.05	최초이관
   			   2019. 11. 21. [#17838] 현행법령 서비스 개선
   			   2019. 12. 05. [#18271] 조문목록 확인요청
			   2020. 01. 09. [#18390] 웹접근성 및 호환성 관련 처리 요청
			   2021. 05. 20. [#24324] 3단비교 조문 이동 기능 개발
 	           2022. 07. 28. [#30100] 법령 왼쪽 목록에서 별표와 서식을 구분하여 보여질수 있도록 개선
  			   2023. 06. 30. [#32892] 하드코딩된 교육청 코드 소스들을 캐시로 수정			   
 			   2023. 11. 23. [#33344] 공공기관 규정 좌측 트리 표시 개선			   
 			   2024. 03. 28. [#34193] 본문 내 좌측 트리 조회 기능 개선
			   2024. 05. 09. [#34606] 민법, 상법 좌측 목록에 편만 볼 수 있는 기능 추가 요청
			   2024. 05. 23. [#34706] 영문법령 팝업페이지 트리 언어 오류
			   2024. 07. 11. [#34723] 법령 좌측 트리 조회 기능 개선
			   2024. 07. 25. [#35155] 가지번호가 있는 편장절관 처리(하위 요소 닫기 기능 추가)
 *          
 */

var joTreeValue = {divId : ""
				   ,nwYn : ""
				   ,lsiSeq : ""
				   ,topNode : ""
				   ,mode : 0
				   ,deptPrev: ""
				   ,gubun: ""
				};
				
function joTreeValueDel(){
		joTreeValue.divId = ""
		joTreeValue.topNode = ""
}

/**
 * <pre>
 * 	list 목록 클릭 후 (조문/부칙/별표 목록) 조회 요청
 * </pre>
 * @author brKim
 * @since 2017. 6. 8.
 * @param divId
 * @param mode
 * @param nwYn
 * @param lsiSeq
 * @param gubun
 */
function fSelectJoList(divId, mode, nwYn, lsiSeq, gubun) {

		if(nwYn == undefined){
			nwYn = '';
		}
	var url = "joListRInc.do";
	if($('#'+divId).length != 0){
		if (lsiSeq && divId) {
			
			if (!$("#" + divId).html()) {
				
				if(divId == "SpanJo"){ //팝업일때
					if (mode == '1' || mode == '11') { // 법령 조문 
						procObj = makeLsPopTree;
					} else if (mode == '2' || mode == '3' || mode == '22' || mode == '33') { // 법령 부칙 & 별표 
						procObj = makeLsJoArByTree;
					} else if (mode == '99' ) { // 자치법규 팝업 조문 전체조회요청 
						procObj = makeOrdinTreePopOpenAll;
					} else if (mode == '999' ) { // 법령조문 팝업 전체조회요청 
						procObj = makeLsTreePopOpenAll;
					}
				}else{
					if (mode == '1' || mode == '11') { // 법령 조문 
						procObj = makeLsTree;
					} else if (mode == '2' || mode == '3' || mode == '22' || mode == '33') { // 법령 부칙 & 별표 
						procObj = makeLsJoArByTree;
					} else if (mode == '99' ) { // 법령 조문 전체 조회요청 
						procObj = makeLsTreeOpenAll;
					}
				}
				
				var nwJoYnInfoVal = "";
				var efYdVal       = "";
				var ancYnChkVal = "";
				
				if ($("#nwJoYnInfo")) {
					nwJoYnInfoVal = $("#nwJoYnInfo").val();
				}
				
				if (el("efYd") != null) {
					efYdVal = $("#efYd").val();
				}

				if (el("ancYnChk") != null && $('#ancYnChk').val() != undefined && $('#ancYnChk').val() != 'undefined') {
					ancYnChkVal = $("#ancYnChk").val();
				}

				/*
				 * 20191104 부칙 시행일 기준으로 나오기 위해 시행일자(efYd), 시행 공포구분값(ancYnChk) 을 
				 * 파라미터로 넘겨준다.
				 * 
				 * */
				url += "?lsiSeq=" + lsiSeq
				+ "&mode=" + mode
				+ "&chapNo=1" + "&nwYn=" + nwYn
				+ "&nwJoYnInfo=" + nwJoYnInfoVal
				+ "&efYd=" + efYdVal
				+ "&ancYnChk=" + ancYnChkVal;
				
				joTreeValue.mode = 0;
				
				if (mode == '11' || mode == '22' || mode == '33' || mode == '99') {
					
					url = "ordinJoListRInc.do?ordinSeq=" + lsiSeq
							+ "&mode=" + mode
							+ "&chapNo=1" 
							+ "&nwYn=" + nwYn 
							+ "&gubun=" + gubun
							+ "&divId=" + divId;
					
					joTreeValue.mode = 1;
					
					if ($("#lgovOrgCd")) {
						url += "&lgovOrgCd=" + $("#lgovOrgCd").val();
					}
				}
				if(mode == '999'){
					url = "joListRInc.do?lsiSeq=" + lsiSeq
					+ "&mode=99" 
					+ "&chapNo=1" + "&nwYn=" + nwYn
					+ "&nwJoYnInfo=" + nwJoYnInfoVal
					+ "&efYd=" + efYdVal
					+ "&ancYnChk=" + ancYnChkVal;
				}
				
				
				joTreeValue.divId = divId;
				joTreeValue.lsiSeq = lsiSeq;
				joTreeValue.nwYn = nwYn;
				joTreeValue.gubun = gubun;
				doRequestUsingPOST(url);
			}
			if(divId == "SpanJo" || divId == "SpanAr" || divId == "SpanBy"){ //팝업일때
				eventObj.list.callDepthPop2(divId);
			}else{
				eventObj.list.callDepth2(divId);
			}
		}
	}
}

/**
 * <pre>
 * 	자치법규 좌측 트리 목록 조회
 * </pre>
 * @author kimsh900
 * @since 2024. 3. 28.
 * @param divId
 * @param mode
 * @param nwYn
 * @param lsiSeq
 * @param gubun
 */
function fSelectJoListTree(divId, mode, nwYn, ordinSeq, gubun) {
	var url = "ordinJoListTreeRInc.do";

	var $targetElement = el(divId);
	var $children = el(divId);

	if (ordinSeq && divId) {

		if ($targetElement.innerHTML.length == 0) {

			// 초기화 작업
			lawNavigation.init(divId);

			// 파라미터 세팅
			var params = {};
			params.ordinSeq = ordinSeq;
			params.section = lawNavigation.searchType;

			$.ajax({
				url: url,
				data: params,
				timeout: 240000,
				dataType: 'json',
				method: 'GET',
				success: function (responseText) {
					if (lawNavigation.searchType === 'Jo') {
						var joTree = lawNavigation.makeJoTreeArray(responseText);
						lawNavigation.makeTreeHtml(joTree, $targetElement);
						lawNavigation.openTree($targetElement);
						if($('#' + divId).find('li[data-chap-type]').length == 0){
							$('#' + divId).css('padding-left', '0px');
						}
					} else if (lawNavigation.searchType === 'Ar') {
						var arTree = lawNavigation.makeArTreeArray(responseText);
						lawNavigation.makeTreeHtml(arTree, $targetElement);
						lawNavigation.openTree($targetElement);
						$('#' + divId).css('padding-left', '0px');
					} else if (lawNavigation.searchType === 'By') {
						var bylTree = lawNavigation.makeBylTreeArray(responseText);
						lawNavigation.makeTreeHtml(bylTree, $targetElement);
						lawNavigation.openTree($targetElement);
						$('#' + divId).css('padding-left', '0px');
					}
				},
				error: function (e) {
					alert('조문 또는 부칙 트리 목록을 가져오는 도중 오류가 발생하였습니다.');
				}
			});
		}
		$targetElement.parentElement.firstElementChild.firstElementChild.textContent = $targetElement.parentElement.classList.toggle('on') ? '본문목록열림' : '본문목록닫힘';
		if ($targetElement.parentElement.firstElementChild.firstElementChild.textContent === '본문목록닫힘') {
			lawNavigation.closeTree($targetElement);
		}
	}
}

/**
 * <pre>
 * 	좌측 조문목록 호출 ( InfoP.do 호출시 적용 )
 * </pre>
 * @author jhok
 * @since 2019. 8. 17.
 * @param divId
 * @param mode
 * @param nwYn
 * @param lsiSeq
 * @param efYd
 * @param gubun
 * @param ancYnChk
 * 
 * 기존에는 좌측 조문목록 호출시에 fSelectJoList 함수를 사용하였으나, 기존의 사용하고 있는 소스를 수정하기에는 영향도가 크므로 fSelectJoListAncInfoP 함수를 새로생성하여사용함.
 * 기존 함수와의 차이점은 efYd, ancYnChk 값을 파라미터로 넘겨서 처리.
 * lsInfoP(팝업)에서 좌측목록 호출시에 사용되어지는 함수 
 */
function fSelectJoListAncInfoP(divId, mode, nwYn, lsiSeq, efYd, gubun, ancYnChk, efDvPop, chapNo, lsId) {
	
	
	if(nwYn == undefined){
		nwYn = '';
	}
	var url = "joListRInc.do";
	
	if($('#'+divId).length != 0){
		if (lsiSeq && divId) {
			
			if (!$("#" + divId).html()) {
				
				if(divId == "SpanJo"){ //팝업일때
					if (mode == '1' || mode == '11') { // 법령 조문 
						procObj = makeLsPopTree;
					} else if (mode == '2' || mode == '3' ||  mode == '7' || mode == '22' || mode == '33') { // 법령 부칙 & 별표 
						procObj = makeLsJoArByTree;
					} else if (mode == '99' ) { // 자치법규 팝업 조문 전체조회요청 
						procObj = makeOrdinTreePopOpenAll;
					} else if (mode == '999' ) { // 법령조문 팝업 전체조회요청 
						procObj = makeLsTreePopOpenAll;
					}
				}else{
					if (mode == '1' || mode == '11') { // 법령 조문 
						procObj = makeLsTree;
					} else if (mode == '2' || mode == '3' ||  mode == '7' || mode == '22' || mode == '33') { // 법령 부칙 & 별표 
						procObj = makeLsJoArByTree;
					} else if (mode == '99' ) { // 법령 조문 전체 조회요청 
						procObj = makeLsTreeOpenAll;
					}
				}
											   
				
				if(ancYnChk == null || ancYnChk == '' || ancYnChk == undefined || ancYnChk == 'undefined'){
                    ancYnChk = '';
                }
				
				/* 본문 외 부칙 별표 등 */
				url += "?lsiSeq=" + lsiSeq
				+ "&mode=" + mode
				+ "&chapNo=1" + "&nwYn=" + nwYn
				+ "&ancYnChk=" + ancYnChk //시행일법령(시헹/공포) 여부 값 파라미터 ancYnChk 값 전달
				+ "&efYd=" + efYd// 시행일자 파라미터 efYd값 전달
				+ "&efDvPop=Y";
				
				joTreeValue.mode = 0;
				
				if(mode == '999'){  // 법령조문 팝업 전체조회요청 
					url = "joListRInc.do?lsiSeq=" + lsiSeq
					+ "&mode=99" 
					+ "&chapNo=1" + "&nwYn=" + nwYn
					+ "&ancYnChk=" + ancYnChk //시행일법령(시헹/공포) 여부 값 파라미터 ancYnChk 값 전달
					+ "&efYd=" + efYd		// 시행일자 파라미터 efYd값 전달	
					+ "&efDvPop=Y";

				}
								
				if(lsId == '001706' || lsId == '001702'){ // 민법,상법 인 경우
					url += "&chapNo=" + chapNo;			// 편 팝업
					joTreeValue.chapNo = chapNo;
				}
								
				if($("#viewCls").val() == "engLsInfoR") { // 영문 법령에서 새창을 열어 팝업 호출할 경우
					url += "&chrClsCd=010203";
				} 

				joTreeValue.divId = divId;
				joTreeValue.lsiSeq = lsiSeq;
				joTreeValue.nwYn = nwYn;
				joTreeValue.gubun = gubun;
				doRequestUsingPOST(url);
			}
			if(divId == "SpanJo" || divId == "SpanAr" || divId == "SpanBy" || divId == "SpanBy2"){ //팝업일때
				eventObj.list.callDepthPop2(divId);
			}else{
				eventObj.list.callDepth2(divId);
			}
		}
	}
}

/**
 * <pre>
 * 	법령 좌측 트리 목록 조회( InfoP.do 호출시 적용 )
 * </pre>
 * @author kimsh900
 * @since 2024. 3. 28.
 * @param divId
 * @param mode
 * @param nwYn
 * @param lsiSeq
 * @param efYd
 * @param gubun
 * @param ancYnChk
 * 
 * 기존에는 좌측 조문목록 호출시에 fSelectJoList 함수를 사용하였으나, 기존의 사용하고 있는 소스를 수정하기에는 영향도가 크므로 fSelectJoListAncInfoP 함수를 새로생성하여사용함.
 * 기존 함수와의 차이점은 efYd, ancYnChk 값을 파라미터로 넘겨서 처리.
 * lsInfoP(팝업)에서 좌측목록 호출시에 사용되어지는 함수 
 */
function fSelectJoListAncInfoPTree(divId, mode, nwYn, lsiSeq, efYd, gubun, ancYnChk, efDvPop, chapNo) {
	if(nwYn == undefined){
		nwYn = '';
	}
	var url = "joListTreeRInc.do";
	//
	var LangType = lsVO.LangType;
	if(subMenuIdx == "4"){
		LangType = "010203";
	}
	var datCls = "";
	joTreeValue.lsId = $('#lsId').val();
	
	// 민법 및 상법 편 팝업
	if((joTreeValue.lsId == '001706' || joTreeValue.lsId == '001702') && nwYn == '3' && !chapNo){
		datCls = "lsMs";
	}
	
	var $targetElement = el(divId);
	var $children = el(divId);
	
	if (lsiSeq && divId) {

		if ($targetElement.innerHTML.length == 0) {

			// 초기화 작업
			lawNavigation.init(divId);

			// 파라미터 세팅
			var params = {};
			params.lsiSeq = lsiSeq;
			params.section = lawNavigation.searchType;
			params.chrClsCd = LangType;
			params.efYd = efYd;
			params.joEfYd = efYd;
			params.ancYnChk = ancYnChk;
			params.chapNo = chapNo;

			$.ajax({
				url: url,
				data: params,
				timeout: 240000,
				dataType: 'json',
				method: 'GET',
				success: function (responseText) {
					if (lawNavigation.searchType === 'Jo') {
						var joTree = lawNavigation.makeJoTreeArray(responseText);
						lawNavigation.makeTreeHtml(joTree, $targetElement, datCls);
						lawNavigation.openTree($targetElement);
						if($('#' + divId).find('li[data-chap-type]').length == 0){
							$('#' + divId).css('padding-left', '0px');
						}
					} else if (lawNavigation.searchType === 'Ar') {
						var arTree = lawNavigation.makeArTreeArray(responseText);
						lawNavigation.makeTreeHtml(arTree, $targetElement);
						lawNavigation.openTree($targetElement);
						$('#' + divId).css('padding-left', '0px');
					} else if (lawNavigation.searchType === 'By') {
						var bylTree = lawNavigation.makeBylTreeArray(responseText);
						lawNavigation.makeTreeHtml(bylTree, $targetElement);
						lawNavigation.openTree($targetElement);
						$('#' + divId).css('padding-left', '0px');
					} else if (lawNavigation.searchType === 'Bj') {
						var bylTree = lawNavigation.makeBylTreeArray(responseText);
						lawNavigation.makeTreeHtml(bylTree, $targetElement);
						lawNavigation.openTree($targetElement);
						$('#' + divId).css('padding-left', '0px');
					}
				},
				error: function (e) {
					alert('조문 또는 부칙 트리 목록을 가져오는 도중 오류가 발생하였습니다.');
				}
			});
		}
		$targetElement.parentElement.firstElementChild.firstElementChild.textContent = $targetElement.parentElement.classList.toggle('on') ? '본문목록열림' : '본문목록닫힘';
		if ($targetElement.parentElement.firstElementChild.firstElementChild.textContent === '본문목록닫힘') {
			lawNavigation.closeTree($targetElement);
		}
	}
}

// 영문법령/자치법규  조문 목록조회 요청 
function fSelectEngJoList(divId, mode, nwYn, lsiSeq){
	var url = "engJoListRInc.do";
	
	if (lsiSeq && divId) {
		
		if (!$("#" + divId).html()) {
			
			if (mode == '1' || mode == '11') { // 법령 조문 
				procObj = makeLsTree;
			} else if (mode == '2' || mode == '3' || mode == '22' || mode == '33') { // 법령 부칙 & 별표 
				procObj = makeLsJoArByTree;
			}

			url += "?lsiSeq=" + lsiSeq
				+ "&mode=" + mode
				+ "&chapNo=1" + "&nwYn=" + nwYn;
			
			joTreeValue.mode = 0;
			
			if (mode == '11' || mode == '22' || mode == '33') {
				
				url = "ordinJoListRInc.do?ordinSeq=" + lsiSeq
													 + "&mode=" + mode
													 + "&chapNo=1" + "&nwYn=" + nwYn;
				
				joTreeValue.mode = 1;
			}
			
			joTreeValue.divId = divId;
			joTreeValue.lsiSeq = lsiSeq;
			joTreeValue.nwYn = nwYn;
			doRequestUsingPOST(url);
		}
		eventObj.list.callDepth2(divId);
	}
}

function fSelectEfJoList(divId, mode, nwYn, lsiSeq){
		var url = "joListRInc.do";
		if(lsiSeq != null && divId != ""){
			if(setJoListBgColor2(divId)){
				if(el(divId).innerHTML.length == 0){
					if(mode == '1' || mode == '11'){ // 법령 조문 
						procObj = makeLsTree;
					}else if(mode == '2' || mode == '3' || mode == '22' || mode == '33'){ // 법령 부칙 & 별표 
						procObj = makeLsJoArByTree;
					} 
						url += "?lsiSeq=" + lsiSeq.replace("_","&lsJoEfYdSeq=")
										  + "&mode=" + mode
								   		  + "&chapNo=1" 
										  + "&nwYn=" + nwYn;
					
					joTreeValue.mode = 0;
					if(mode == '11' || mode == '22' || mode == '33'){
						url = "ordinJoListRInc.do?ordinSeq=" + lsiSeq
														  + "&mode=" + mode
												   		  + "&chapNo=1" 
														  + "&nwYn=" + nwYn;
						joTreeValue.mode = 1;						
					}
					
					joTreeValue.divId = divId;
					joTreeValue.lsiSeq = lsiSeq;
					joTreeValue.nwYn = nwYn;
					doRequestUsingPOST( url );
				}
			}
		}
}

function setJoListBgColor2(divId){
	var dt = el(divId + "Dt");
	if(dt.className != "dep1on"){
		dt.className = "dep1on";
		el(divId + "Img").src = el(divId + "Img").src.replace("btn_lmop","btn_lmcl");
		el(divId + "Img").alt = el(divId + "Img").alt.replace("펼침", "닫기");
		//el(divId + "Img").alt = "닫기";
		el(divId).style.display = "";
		return true;
	}else{
		el(divId + "Img").src = el(divId + "Img").src.replace("btn_lmcl","btn_lmop");
		el(divId + "Img").alt = el(divId + "Img").alt.replace("닫기", "펼침");
		//el(divId + "Img").alt = "펼침";
		dt.className = "dep1";
		el(divId).style.display = "none";
		return false;
	}
}

function topJoType(joDat){
	if(joDat.chapNo.substring(4) == "0000000000000000"){
		setTopNodeSe(1, joTreeValue);
		joTreeValue.pyun = joDat.chapNo.substring(0,4);
		joTreeValue.dept = "dep2";
	}else if(joDat.chapNo.substring(8) == "000000000000"){
		setTopNodeSe(2, joTreeValue);
		joTreeValue.jang = joDat.chapNo.substring(0,8);
		joTreeValue.dept = "dep3";
	}else if(joDat.chapNo.substring(12) == "00000000"){
	 	setTopNodeSe(3, joTreeValue);
	 	joTreeValue.jul = joDat.chapNo.substring(0,12);
		joTreeValue.dept = "dep4";
	}else if(joDat.chapNo.substring(16) == "0000"){
	 	setTopNodeSe(4, joTreeValue);
	 	joTreeValue.kwan = joDat.chapNo.substring(0,16);
		joTreeValue.dept = "dep5";
	}else{
	 	setTopNodeSe(5, joTreeValue);
	 	joTreeValue.mok = joDat.chapNo;
		joTreeValue.dept =  "dep6";
	}
}

function joType(joDat){
	if(joDat.chapNo.substring(4) == "0000000000000000"){
		setTempNodeSe(1, joTreeValue);
		joTreeValue.pyun = joDat.chapNo.substring(0,4);
		joTreeValue.dept = "dep2";
	}else if(joDat.chapNo.substring(8) == "000000000000"){
		setTempNodeSe(2, joTreeValue);
		joTreeValue.jang = joDat.chapNo.substring(0,8);
		joTreeValue.dept = "dep3";
	}else if(joDat.chapNo.substring(12) == "00000000"){
		setTempNodeSe(3, joTreeValue);
	 	joTreeValue.jul = joDat.chapNo.substring(0,12);
		joTreeValue.dept = "dep4";
	}else if(joDat.chapNo.substring(16) == "0000"){
		setTempNodeSe(4, joTreeValue);
	 	joTreeValue.kwan = joDat.chapNo.substring(0,16);
		joTreeValue.dept = "dep5";
	}
}

// topNode 와 node 값 설정 
function setTopNodeSe(value, obj){
	if(obj.topNode == ""){
		obj.topNode = value;
	}
	obj.node = value;
}

function setTempNodeSe(value, obj){
	if(obj.tempNode == ""){
		obj.tempNode = value;
	}
	obj.node = value;
}

function getJoType(cls){
	if(cls == 1){
		return joTreeValue.pyun;
	}else if(cls == 2){
		return joTreeValue.jang;
	}else if(cls == 3){
		return joTreeValue.jul;
	}else if(cls == 4){
		return joTreeValue.kwan;
	}else{
		return joTreeValue.mok;
	}
}

function showJoDept(nodeId, num, detp){
	var list = els(nodeId); 
	joTreeValue.deptPrev = detp;
	var mode = "";
	try{
		mode = el(nodeId).title;
	}catch(e){
		if(el(nodeId + "NO" + num + "DIV").innerHTML.length > 0){
			var dpYn = "";
			if(el(nodeId + "NO" + num + "DIV").style.display == ""){
				dpYn = "none";
				hiddenNodeAll(nodeId, "none", "joList");
			}else{
				dpYn = "";
				hiddenNodeAll(nodeId, "", "joList");
				
			}
			el(nodeId + "NO" + num + "DIV").style.display = dpYn;
			return null;
		}
		procObj = makeJoTree;
		if(num != ""){
			joTreeValue.divId = nodeId + "NO" + num + "DIV";
		}
		var url = "";
		var lsCls = 0;
		if(joTreeValue.mode == 0){			// 법령 : 0 , 자치법규 : 1
			url = "joListRInc.do?lsiSeq=";
			lsCls = 1;
		}else{
			url = "ordinJoListRInc.do?ordinSeq=";
			lsCls = 11;
		}
		doRequestUsingPOST(url + joTreeValue.lsiSeq
												 + "&mode=" + lsCls 
												 + "&chapNo=" +  nodeId
												 + "&nwYn=" + joTreeValue.nwYn
												 + "&gubun=" + joTreeValue.gubun);
		 
		return null;
	}
	 if(mode != "none"){
	 	el(nodeId).title = "none";
	 	mode = "none";
	 }else{
	 	el(nodeId).title = "";
	 	mode = "";
	 }
	
	for(var i = 0; i < list.length; i++){
		JoDeptDp(list[i].value, mode);
	}
	
	if(mode == "none"){
		hiddenNodeAll(nodeId, "none", "joList");
	}
}

function setChgImg(num){
	var img = el("img" + num);
	if(img.src.indexOf('btn_lmop.gif') > 0){
		img.src = img.src.replace("btn_lmop.gif","btn_lmcl.gif");
		img.alt = "닫기";
	}else{
		img.src = img.src.replace("btn_lmcl.gif","btn_lmop.gif");
		img.alt = "펼침";
	}
}

function setChgImgSe(num, mode){
	var img = el("img" + num);
	if(mode){
		img.src = img.src.replace("btn_lmop.gif","btn_lmcl.gif");
		img.alt = "펼침";
	}else{
		img.src = img.src.replace("btn_lmcl.gif","btn_lmop.gif");
		img.alt = "닫기";
	}
}


function hiddenNodeAll(nodeId, mode, frmId){
	var frm = el(frmId);
		var frmList = frm.getElementsByTagName("input");
		for(var i = 0; i < frmList.length; i++){
		      if(frmList[i].value.substring(0,nodeId.length) == nodeId){
		           el(frmList[i].value).style.display = mode;
		           try{
		        	    // 버튼이미지 변경안됌 + - 임시 주석처리 (10.24)
		           		// setChgImgSe(frmList[i].value, false);
		           }catch(e){}
		      }
		}
}

function setJoDept(){
	var dept = joTreeValue.deptPrev;
	if(dept == 'dep2'){
		return 'dep3';
	}else if(dept == 'dep3'){
		return 'dep4';
	}else if(dept == 'dep5'){
		return 'dep6';
	}else{
		return 'dep07';
	}
}

function JoDeptDp(obj, mode){
	if(mode != "none"){
		el(obj).style.display = "";
		el(obj).title = "";
	}else{
		el(obj).style.display = "none";
		el(obj).title = "none";
	}
}

function makeLsJoArByTree(){
	var text = xmlHttp.responseText;
	var list = null;
	var joList = ""; 
	var dept = ""; 
	  list = eval('('+text+')');
	  if(list.length > 0){
	  		for(var i = 0; i < list.length; i++){
	 			 	joList += "<div class=\"dep2\"><a href=\"#J" + list[i].joLink + "\" onclick=\"focusMulti('J"+list[i].joLink+"');return false;\">" 
	 			 				+ list[i].joTit 
	 			 				+ "</a></div>";
	   		}
	  }
	  document.getElementById(joTreeValue.divId).innerHTML = joList;
	  el(joTreeValue.divId).style.display = "";
}


/**
 * <pre>
 * 	법령 목록 트리구조 생성
 *  =>	장이 없을 경우에는 2뎁스
 *  	장이 있을 경우에는 3뎁스로 구분 된다.
 * </pre>
 * @author brKim
 * @since 2017. 7. 10.
 */
function makeLsTree() {
	
	var text = xmlHttp.responseText;
	var list = null;
	var joList = ""; 
	var dept = "";
	
	joTreeValue.dept = "";
	joTreeValue.deptPrev = "";
	joTreeValue.topNode = "";
	joTreeValue.tempNode = "";
	joTreeValue.node = "";
	
	list = eval('('+text+')');
	if (list.length > 0) {
		for(var i = 0; i < list.length; i++){
  			if(list[i].joYn == "N"){
  				topJoType(list[i]);
  			 	// topNode 세팅
  			 	if(joTreeValue.topNode == joTreeValue.node){
			 			joList += "<li>"
  			 				+ "<a href=\"#\" onclick=\"showTopJoDept('','" + joTreeValue.topNode + "','" + getJoType(joTreeValue.node) + "','" + i + "','" + joTreeValue.dept + "','"+joTreeValue.lsiSeq+"');\">"
  			 				+ "<span class=\"ico\">하위메뉴닫기</span>" + list[i].joTit
  			 				+ "</a>"
  			 				+ "<ul class=\"depth_bx type\" id=\"" + getJoType(joTreeValue.node) + "TOP" + i + "UL" + joTreeValue.lsiSeq + "\"></ul>"
  			 				+ "</li>";
	  			 }
  			}else{
  				
				joList += "<li>"
						+ "<a href=\"#J" + list[i].joLink + "\">" + list[i].joTit + "</a>"
						+ "</li>";
  			}
   		}
  }
	document.getElementById(joTreeValue.divId).innerHTML = joList;
}


function makeLsPopTree() {
	
	var text = xmlHttp.responseText;
	var list = null;
	var joList = ""; 
	var dept = "";
	
	joTreeValue.dept = "";
	joTreeValue.deptPrev = "";
	joTreeValue.topNode = "";
	joTreeValue.tempNode = "";
	joTreeValue.node = "";
	
	list = eval('('+text+')');
	if (list.length > 0) {
		for(var i = 0; i < list.length; i++){
  			if(list[i].joYn == "N"){
  				topJoType(list[i]);
  			 	// topNode 세팅
  			 	if(joTreeValue.topNode == joTreeValue.node){
			 			joList += "<li>"
  			 				+ "<a href=\"#\" onclick=\"showTopJoDept('pop','" + joTreeValue.topNode + "','" + getJoType(joTreeValue.node) + "','" + i + "','" + joTreeValue.dept + "','"+joTreeValue.lsiSeq+"');\">"
  			 				+ "<span class=\"ico\">하위메뉴닫기</span>" + list[i].joTit
  			 				+ "</a>"
  			 				+ "<ul class=\"depth_bx type\" id=\"" + getJoType(joTreeValue.node) + "TOP" + i + "UL" + joTreeValue.lsiSeq + "\"></ul>"
  			 				+ "</li>";
	  			 }
  			}else{
  				
				joList += "<li>"
						+ "<a href=\"#J" + list[i].joLink + "\">" + list[i].joTit + "</a>"
						+ "</li>";
  			}
   		}
  }
	document.getElementById(joTreeValue.divId).innerHTML = joList;
}

/**
 * <pre>
 * 	법령 목록 트리구조 AJAX 호출 (2뎁스 클릭 시)
 * </pre>
 * @author brKim
 * @since 2017. 7. 10.
 * @param nodeId
 * @param num
 * @param detp
 * @param lsiseq
 * @returns
 */
function showTopJoDept(gubun, pjjgNode,nodeId, num, dept, seq){
	
	var list = els(nodeId);
	
	joTreeValue.deptPrev = dept;
	joTreeValue.tempNode = 0;
	joTreeValue.divId = "";
	joTreeValue.lsiSeq = seq;
	
	var mode = "";
	
	if (!$('#'+nodeId+'TOP'+num+'UL'+joTreeValue.lsiSeq).html()) {
		
		procObj = makeJoTree;
		joTreeValue.divId = nodeId + "TOP" + num + "UL" + joTreeValue.lsiSeq;
		
		var url = "";
		var lsCls = "";
		
		if (joTreeValue.mode == 0) { // 법령 : 0 , 자치법규 : 1
			url = "joListRInc.do?lsiSeq=";
			lsCls = 1;
		} else {
			url = "ordinJoListRInc.do?ordinSeq=";
			lsCls = 12;
		}
		
		doRequestUsingPOST(url + joTreeValue.lsiSeq + "&mode=" + lsCls
													+ "&chapNo=" + nodeId
													+ "&nwYn=" + joTreeValue.nwYn
													+ "&gubun=" + joTreeValue.gubun
													+ "&joYn=N"
													+ "&pjjgNode="+pjjgNode);
		
	}
	
	if(gubun == 'pop'){ //팝업일때
		eventObj.list.callDepthPop3(nodeId+'TOP'+num+'UL'+ joTreeValue.lsiSeq);
		joTreeValue.gubun = "pop";
	}else{
		eventObj.list.callDepth3(nodeId+'TOP'+num+'UL'+ joTreeValue.lsiSeq);
		joTreeValue.gubun = "";
	}
	
}

/**
 * <pre>
 * 	자치법규 목록 장 클릭 시 조문 생성
 * </pre>
 * @author brKim
 * @since 2017. 7. 10.
 */
function makeJoTree() {
	
	var text = xmlHttp.responseText;
	var list = null;
	var joList = ""; 
	var dept = setJoDept(); 
	  list = eval('('+text+')');
	  if(list.length > 0){
	  		for(var i = 0; i < list.length; i++){ //처음 들어온게 joYn이 N이면 아직 편장절관이 끝나지 않았으므로, 이 안에서의 탑노드 설정.
	  			if(list[i].joYn == 'N'){
	  				joType(list[i])
	  			}else{
	  				joTreeValue.node = 999;
	  			}	 	  				
	  			
	  			if(joTreeValue.node == joTreeValue.tempNode){
	  				if((list[i].childJoCnt > 0) || (i+1 < list.length? joTreeValue.node < list[i+1].pjjgNode: false)){
		  				joList += "<li>"
								+ "<a href=\"#\" onclick=\"showTopJoDept('"+joTreeValue.gubun+"','"+ joTreeValue.tempNode +"','" + getJoType(joTreeValue.node) + "','"+ i +"','" + joTreeValue.dept + "','"+joTreeValue.lsiSeq+"');\">"
									+ "<span class=\"ico\">하위메뉴닫기</span>" + list[i].joTit
								+ "</a>"
								+ "<ul class=\"depth_bx type\" id=\"" + getJoType(joTreeValue.node) + "TOP" + i + "UL" + joTreeValue.lsiSeq + "\"></ul>"
								+ "</li>";
	  				}else{
	  					joList += "<li>"
		  						+ "<a href=\"#\" onclick=\"showTopJoDept('"+joTreeValue.gubun+"','"+ joTreeValue.tempNode +"','" + getJoType(joTreeValue.node) + "','"+ i +"','" + joTreeValue.dept + "','"+joTreeValue.lsiSeq+"');\">"
		  						+ list[i].joTit
		  						+ "</a>"
		  						+ "<ul class=\"depth_bx type\" id=\"" + getJoType(joTreeValue.node) + "TOP" + i + "UL" + joTreeValue.lsiSeq + "\"></ul>"
		  						+ "</li>";
	  				}
	  			}else if (list[i].joYn == 'Y'){	//처음 들어온게 joYn이 Y이면 조문만 있는 형식.
	  				joList += "<div class=\"dep07\"  id=\""+ list[i].chapNo + "JO" + i +"\"><a href=\"#J" + list[i].joLink + "\">" 
			  				+ list[i].joTit 
			  				+ "</a><input type=\"hidden\" title=\"none\" name=\"" + list[i].chapNo + "JO" + i 
			  				+ "\" value=\"" + list[i].chapNo + "JO" + i +"\"/></div>";
	  			}
	   		}
	  }
	  //el(joTreeValue.divId).style.display = "";
	  document.getElementById(joTreeValue.divId).innerHTML = joList;
}

/**
 * <pre>
 * 	조문 전체 펼치기
 * </pre>
 * @author dsKim
 * @since 2019. 2. 21.
 */
function makeLsTreeOpenAll() {
	
	var text = xmlHttp.responseText;
	var list = null;
	var joList = ""; 
	var dept = "";
	var pgYn = "N"; // 편장절관형식
	var beforeJoYn = "N";
	var beforePg = ""; 
	
	list = eval('('+text+')');
	
	if(list[0].joYn == "N"){
		  pgYn = "Y";
	  }
	
	if (list.length > 0) {
		
		for(var i = 0; i < list.length; i++){
  			
  			//편장절관형식 경우
  			if(pgYn == "Y"){
  				
					// topNode 세팅
					joType(list[i]);
					
  				//장도 끝났고 조문출력도 다 끝났으면 닫아줌
  				if(list[i].joYn == "N" && beforeJoYn == "Y" && beforePg == joTreeValue.dept){
  					joList += "</ul></li>"; 
  				}
  				//편장절관 뽑아냄
  				if(list[i].joYn == "N" ){
	  				if(joTreeValue.topNode == joTreeValue.node ){
	  					joList += "<li class=\"on\">"
	  						+ "<a href=\"javascript:;\" onclick=\"showTopJoDept('','" + getJoType(joTreeValue.node) + "','"+ i +"','" + joTreeValue.dept + "');\">"
	  						+ "<span class=\"ico\">하위메뉴닫기</span>" + list[i].joTit
	  						+ "</a>"
	  						+ "<ul class=\"depth_bx type\" id=\"" + getJoType(joTreeValue.node) + "TOP" + i + "UL" + "\">" + "";
	  					beforePg = joTreeValue.dept;
	  				}else{
	  					/*기존로직 사용*/
	  					joList += "<div class=\"" + joTreeValue.dept + "\" id=\""
			 				+ getJoType(joTreeValue.node -1)+ "NO" + i +"\"name=\"" + getJoType(joTreeValue.node -1) 
			 				+ "\" style=\"display:none;\">"
			 				+ "<a href=\"#AJAX\"onclick=\"javascript:showJoDept('" + getJoType(joTreeValue.node) + "','"+ i +"','" + joTreeValue.dept + "');return false;\"><img id=\"img" + getJoType(joTreeValue.node)+ "NO" + i +"DIV\"src=\"images/button/btn_lmop.gif\" alt=\"펼침\" /></a>"
			 				+"<a href=\"#J" + list[i].joLink + "\">" + list[i].joTit 
			 				+ "</a><input type=\"hidden\" title=\"none\" name=\"" + getJoType(joTreeValue.node -1) 
			 				+ "\" value=\"" + getJoType(joTreeValue.node -1)+ "NO" + i +"\"/></div>"
			 				+ "<input type=\"hidden\" name=\""+ getJoType(joTreeValue.node -1) +"JO\" value=\""+ getJoType(joTreeValue.node)+ "NO" + i +"DIV\" />"
			 				+ "<div id=\"" + getJoType(joTreeValue.node)+ "NO" + i +"DIV\" style=\"display:none;\"></div>"
	  				} 
	  				beforeJoYn = "N";
	  				//조문뽑아냄
  				}else{
  					joList += "<div class=\"dep7\"  id=\""+ list[i].chapNo + "JO" + i +"\"><a href=\"#J" + list[i].joLink + "\">" 
		 				+ list[i].joTit 
			 				+ "</a><input type=\"hidden\" title=\"none\" name=\"" + list[i].chapNo + "JO" + i 
			 				+ "\" value=\"" + list[i].chapNo + "JO" + i +"\"/></div>";
  					beforeJoYn = "Y";
  				}
  				//편장절관이 없는 경우 조문만 뽑아낸다.
  			}else{
  				joList += "<li>"
					+ "<a href=\"#J" + list[i].joLink + "\">" + list[i].joTit + "</a>"
					+ "</li>";
  			}
   		}
	}
	
  	$('#'+joTreeValue.divId).html("<form id='joList'>" + joList + "</form>");
}
/**
 * <pre>
 * 	조문 전체 펼치기
 * </pre>
 * @author dsKim
 * @since 2019. 2. 21.
 */
function makeOrdinTreePopOpenAll() {
	
	var text = xmlHttp.responseText;
	var list = null;
	var joList = ""; 
	var dept = "";
	var pgYn = "";
	list = eval('('+text+')');
	
	if(list[0].joYn == "N"){
		pgYn = "Y";
	}else{
		pgYn = "N";
		//document.getElementById(joTreeValue.divId).className = 'spanjo';
	}

	if (list.length > 0) {

		for (var i = 0; i < list.length; i++) {
			isPgYn = "Y";
			// 편장절관형식 경우
			if (pgYn == "Y") {

				// 편장절관 뽑아냄
				if (list[i].joYn == "N") {
					// topNode 세팅
					topJoType(list[i]);

					// 편장절관
					var clickEvent = "";
					// 조문이 아닌 첫번째 노드(편, 장, 절, 관중 아무거나 다 올수 있음. 대체로 편, 장이 옴)
					if (joTreeValue.topNode == joTreeValue.node) {
						// 첫번째 편,장,절,관 이전에 전문이 오는경우 전문은 첫번째 장으로 세팅한다.
						if (isPgYn == "N") {
							joTreeValue.node = "dep02";
							joTreeValue.dept = "dep02";
						}
						try {
							clickEvent = "onclick=\"showAllJoDept('"
									+ getJoType(joTreeValue.node) + "', '" + i
									+ "','" + joTreeValue.dept + "',this);\"";
						} catch (e) {
							clickEvent = "onclick=\"showAllJoDept('"
									+ getJoType(joTreeValue.node) + "','" + i
									+ "','" + joTreeValue.dept + "',this);\"";
						}

						joList += "<div class=\""+ joTreeValue.dept+ "\" id=\""+ getJoType(joTreeValue.node)+ joTreeValue.dept+ "\">"
								+ "<a href=\"javascript:;\" "+ clickEvent+ ">"
								+ "<span class=\"ico\" style =\"background-image: url(images/button/btn_lmcl.gif)\">하위메뉴닫기</span>"
								+ list[i].joTit + "</a></div>";
						beforePg = joTreeValue.dept;
						beforeJoYn = "N";
						// 조문이 아닌 두번째 노드(편이 있다면 편을 제외한 장, 절, 관이 해당됨, 장만 있다면 해당)
					} else {
						try {
							clickEvent = "onclick=\"showAllJoDept('"
									+ getJoType(joTreeValue.node) + "','" + i
									+ "','" + joTreeValue.dept + "',this);\"";
						} catch (e) {
							clickEvent = "onclick=\"showAllJoDept('"
									+ getJoType(joTreeValue.node) + "','" + i
									+ "','" + joTreeValue.dept + ",this');\"";
						}

						joList += "<div class=\""+ joTreeValue.dept+ " type on\" id=\""+ getJoType(joTreeValue.node)+ joTreeValue.dept+ "\">"
								+ "<a href=\"javascript:;\" "+ clickEvent+ ">"
								+ "<span class=\"ico\" style =\"background-image: url(images/button/btn_lmcl.gif)\">하위메뉴닫기</span>"
								+ list[i].joTit + "</a></div>";
						beforePg = joTreeValue.dept;
						beforeJoYn = "N";
					}
					// 해당 편장절관의 조문뽑아냄
				} else {
					joList += "<div class=\"" + setJoDept(joTreeValue.dept)
							+ " type on\">" + "<a href=\"#J" + list[i].joLink
							+ "\" onclick=\"focusMulti('J" + list[i].joLink
							+ "');return false;\">" + list[i].joTit + "</a>"
							+ "</div>";
					beforeJoYn = "Y";
				}
				// 편장절관이 없는 경우 조문만 뽑아낸다.
				// 팝업인 경우 좌측목록 닫은채로 본문 클릭시 mode = 99 이고 이때는 상위 디브에 class를 추가해준다.
			} else {
				joList += "<div class=\"dep07 type on\">" + "<a href=\"#J"
						+ list[i].joLink
						+ "\" onkeypress=\"\" onclick=\"focusMulti('J"
						+ list[i].joLink + "');return false;\">"
						+ list[i].joTit + "</a>" + "</div>";
			}
		}
	}
	document.getElementById(joTreeValue.divId).innerHTML = joList;
	eventObj.list.callLsDepth2(joTreeValue.divId);
}

/**
 * <pre>
 * 	법령 팝업 조문 전체 펼치기
 * </pre>
 * @author dsKim
 * @since 2019. 2. 21.
 */
function makeLsTreePopOpenAll() {
	
	var text = xmlHttp.responseText;
	var list = null;
	var joList = ""; 
	var dept = "";
	var pgYn = "N"; // 편장절관형식
	var beforeJoYn = "N";
	var beforePg = ""; 
	var rgExpPJ = /([0-9]+[편|장|절|관])|[PREAMBLE|PART|CHAPTER|SECTION|SUB-SECTION]/g;
	var pjCntYn = "";
	var isPgYn = "Y";
	var viewClsCheck = $("#viewCls").val(); // 3단비교 체크
	var lsKndCdGubun = $("#thdCmpLsGuBun").val(); // 3단비교 법령, 시행령, 시행규칙 구분
	var chapNo = joTreeValue.chapNo;
	
	list = eval('('+text+')');
	
	if(list[0].joYn == "N"){
		  pgYn = "Y";
	  }
	
	//민법,상법 편 팝업보기  _ 팝업 좌측트리 해당 편의 정보만 나오게
	var getChapNo = "";
	var selectPyunList = [];
	var pyunPopFlag = false;
	if(chapNo){
		for(var i=0;i<chapNo.length;i+=4){
			if("0000"==chapNo.substring(i,i+4)){
				break;
			}else{
				getChapNo += chapNo.substring(i,i+4);
			}
		}
	}

	if (list.length > 0) {
		if(getChapNo){
			for(var i = 0; i < list.length; i++){
				if(list[i].chapNo.indexOf(getChapNo)==0){
					selectPyunList.push(list[i]);
				}
			}
			list = selectPyunList;
			pyunPopFlag = true;
		}
		for(var i = 0; i < list.length; i++){
  			
  			//편장절관형식 경우
  			if(pgYn == "Y"){
  				
	  			//전문, 1장, 2장 이어지는 형식일 경우(case: 대한민국헌법) 예외처리
  				if(list[i].joYn == "N" ){
  					pjCntYn = list[i].joTit.match(rgExpPJ);
  					if(i != 0 && pjCntYn == null){
  						list[i].joYn = "Y";
  					}else if(i == 0 && list[i].joTit.indexOf("전문") > 0){
  						isPgYn = "N";
  					}else if(i == 0 && list[i].joTit.indexOf("PREAMBLE") > -1){
  						isPgYn = "N";
  					}
  				}
  				
  				//편장절관 뽑아냄
  				if(list[i].joYn == "N" ){
  					// topNode 세팅
  					lsJoType(list[i]);
  					
  		  			//편장절관
  					var clickEvent = "";
  					//조문이 아닌 첫번째 노드(편, 장, 절, 관중 아무거나 다 올수 있음. 대체로 편, 장이 옴)
	  				if(joTreeValue.topNode == joTreeValue.node ){
	  					//첫번째 편,장,절,관 이전에 전문이 오는경우 전문은 첫번째 장으로 세팅한다.
	  					if(isPgYn == "N"){
	  						joTreeValue.node = "dep02";
	  						joTreeValue.dept = "dep02";
	  					}
	  					try {
  							clickEvent = "onclick=\"showLsJoDept('" + getJoType(joTreeValue.node) + "','" + i + "','" + joTreeValue.dept + "','" + joTreeValue.lsiSeq + "', this);\"";
	  					} catch (e) {
	  						clickEvent = "onclick=\"showLsJoDept('" + getJoType(joTreeValue.node) + "','" + i + "','" + joTreeValue.dept + "','" + joTreeValue.lsiSeq + "', this);\"";
	  					}
	  					
	  					if(pyunPopFlag){
	  						joList += "<div class=\"" + joTreeValue.dept + " on\">"
								+ "<a href=\"javascript:;\" " + clickEvent + "style =\"background-image: url(\"\") !important;\">"
								+ "<span class=\"ico\" style =\"background-image: url(images/button/btn_lmcl.gif)\" >하위메뉴닫기</span>" + list[i].joTit + "</a></div>";
	  					}else{
	  						joList += "<div class=\"" + joTreeValue.dept + " on\">"
	  								+ "<a href=\"javascript:;\" " + clickEvent + "style =\"background-image: url(\"\")!important;\">"
	  								+ "<span class=\"ico\" style =\"background-image: url(images/button/btn_lmcl.gif)\" >하위메뉴닫기</span>" + list[i].joTit + "</a>";
	  								if(joTreeValue.dept == 'dep01' && (lsVO.lsValue.lsId == '001706' || lsVO.lsValue.lsId == '001702' || lsVO.lsValue.lsId == '013976') && joTreeValue.nwYn == '3'){	//민법,상법 편 팝업
	  									joList += "<a href=\"javascript:;\" id=\"btnPyunDetail\" onclick=\"javascript:lsContentsView(true, true, '"+getJoType(joTreeValue.node)+"');\"></a>";
	  								}
	  						joList += "</div>";
	  					}
	  					beforePg = joTreeValue.dept;
	  					beforeJoYn = "N";
	  					//조문이 아닌 두번째 노드(편이 있다면 편을 제외한 장, 절, 관이 해당됨, 장만 있다면 해당)
	  				}else{
	  					try {
	  						clickEvent = "onclick=\"showLsJoDept('" + getJoType(joTreeValue.node) + "','" + i + "','" + joTreeValue.dept + "','" + joTreeValue.lsiSeq + "', this);\"";
	  					} catch (e) {
	  						clickEvent = "onclick=\"showLsJoDept('" + getJoType(joTreeValue.node) + "','" + i + "','" + joTreeValue.dept + "','" + joTreeValue.lsiSeq + "', this);\"";
	  					}
	  					
	  					joList += "<div class=\"" + joTreeValue.dept + " type on\">" 
	  					+ "<a href=\"javascript:;\" " + clickEvent + ">"
	  					+ "<span class=\"ico\" style =\"background-image: url(images/button/btn_lmcl.gif)\">하위메뉴닫기</span>" + list[i].joTit + "</a></div>";
	  					beforePg = joTreeValue.dept;
	  					beforeJoYn = "N";
	  				}
	  				//해당 편장절관의 조문뽑아냄
  				}else{
  					if(viewClsCheck == "thdCmpNewScP" && lsKndCdGubun == "A0002"){ // 3단비교 (법령)
  	  					joList += "<div class=\"" + setLsJoDept(joTreeValue.dept) + " type on\">"
  						+ "<a href=\"#L" + list[i].joLink + "\" onclick=\"focusLsThdCmpMulti('L" + list[i].joLink + "');return false;\">"
  							+ list[i].joTit
  						+ "</a>"+ "</div>";
  	  					beforeJoYn = "Y";  						
  					}else if(viewClsCheck == "thdCmpNewScP" && lsKndCdGubun == "A0003"){ // 3단비교 (시행령)
  	  					joList += "<div class=\"" + setLsJoDept(joTreeValue.dept) + " type on\">"
  						+ "<a href=\"#O" + list[i].joLink + "\" onclick=\"focusLsThdCmpMulti('O" + list[i].joLink + "');return false;\">"
  							+ list[i].joTit
  						+ "</a>"+ "</div>";
  	  					beforeJoYn = "Y";
  					}else if(viewClsCheck == "thdCmpNewScP" && lsKndCdGubun == "A0004"){// 3단비교 (시행규칙)
  	  					joList += "<div class=\"" + setLsJoDept(joTreeValue.dept) + " type on\">"
  						+ "<a href=\"#R" + list[i].joLink + "\" onclick=\"focusLsThdCmpMulti('R" + list[i].joLink + "');return false;\">"
  							+ list[i].joTit
  						+ "</a>"+ "</div>";
  	  					beforeJoYn = "Y";  						
  					}else {
  	  					joList += "<div class=\"" + setLsJoDept(joTreeValue.dept) + " type on\">"
  						+ "<a href=\"#J" + list[i].joLink + "\" onclick=\"focusMulti('J" + list[i].joLink + "');return false;\">"
  							+ list[i].joTit
  						+ "</a>"+ "</div>";
  	  					beforeJoYn = "Y";  						
  					}
  				}
  				//편장절관이 없는 경우 조문만 뽑아낸다.
  			}else{
  				if(viewClsCheck == "thdCmpNewScP" && lsKndCdGubun == "A0002"){ // 3단비교 (법령)
  	  				joList += "<div class=\"dep00 type on\">"
  						+ "<a href=\"#L" + list[i].joLink + "\" onclick=\"focusLsThdCmpMulti('L" + list[i].joLink + "');return false;\">" + list[i].joTit + "</a>"
  					+ "</div>";  					
  				}else if(viewClsCheck == "thdCmpNewScP" && lsKndCdGubun == "A0003"){// 3단비교 (시행령)
  	  				joList += "<div class=\"dep00 type on\">"
  						+ "<a href=\"#O" + list[i].joLink + "\" onclick=\"focusLsThdCmpMulti('O" + list[i].joLink + "');return false;\">" + list[i].joTit + "</a>"
  					+ "</div>";  					
  				}else if(viewClsCheck == "thdCmpNewScP" && lsKndCdGubun == "A0004"){// 3단비교 (시행규칙)
  	  				joList += "<div class=\"dep00 type on\">"
  						+ "<a href=\"#R" + list[i].joLink + "\" onclick=\"focusLsThdCmpMulti('R" + list[i].joLink + "');return false;\">" + list[i].joTit + "</a>"
  					+ "</div>";  					
  				}else {
  	  				joList += "<div class=\"dep00 type on\">"
  						+ "<a href=\"#J" + list[i].joLink + "\" onkeypress=\"\" onclick=\"focusMulti('J" + list[i].joLink + "');return false;\">" + list[i].joTit + "</a>"
  					+ "</div>";  					
  				}

  			}
   		}
	}
	
	$('#SpanJo').html("<form id='joList'>" + joList + "</form>");
}

function showLsJoDept(nodeId, num, dept, lsiseq, obj) {
	
	var list = els(nodeId);
	
	joTreeValue.deptPrev = dept;
	var LangType = lsVO.LangType;
	if(subMenuIdx == "4"){
		LangType = "010203";
	}
	var mode = "";
	var checkJoDiv = false;
	
	checkJoDiv = $(obj).parent().next('div').hasClass('type');
	
	if (!checkJoDiv) {
		
		procObj = makeJoTree; // 콜백 함수
		
		joTreeValue.divId = $(obj).parent();
		
		var url = "joListRInc.do?lsiSeq=";
		var lsCls = 1;
		
		doRequestUsingPOST(url + lsiseq + "&mode=" + lsCls + "&chapNo=" + nodeId
					+ "&nwYn=" + joTreeValue.nwYn + "&gubun=" + joTreeValue.gubun+ "&chrClsCd=" + LangType );
		
	} else {
		eventObj.list.callLsDepth3(obj);
	}
	
	
}

function lsJoType(joDat) {
	if (joDat.chapNo.substring(4) == "0000000000000000") { // 편
		setTopNodeSe(1, joTreeValue);
		joTreeValue.pyun = joDat.chapNo;
		joTreeValue.dept = "dep01";
	} else if (joDat.chapNo.substring(8) == "000000000000") { // 장
		setTopNodeSe(2, joTreeValue);
		joTreeValue.jang = joDat.chapNo;
		joTreeValue.dept = "dep02";
	} else if (joDat.chapNo.substring(12) == "00000000") { // 절
		setTopNodeSe(3, joTreeValue);
	 	joTreeValue.jul = joDat.chapNo;
		joTreeValue.dept = "dep03";
	} else if (joDat.chapNo.substring(16) == "0000") { // 관
		setTopNodeSe(4, joTreeValue);
	 	joTreeValue.kwan = joDat.chapNo;
		joTreeValue.dept = "dep04";
	} else { // 목
		setTopNodeSe(5, joTreeValue);
	 	joTreeValue.mok = joDat.chapNo;
		joTreeValue.dept =  "dep05";
	}

}

function setLsJoDept(dept){
	var resultDept = null;
	switch (dept) {
	case "dep01": resultDept = "dep02"; break;
	case "dep02": resultDept = "dep03"; break;
	case "dep03": resultDept = "dep04"; break;
	case "dep04": resultDept = "dep05"; break;
	}
	return resultDept;
}

function showAllJoDept(nodeId, num, dept, obj) {

	var list = els(nodeId);

	joTreeValue.deptPrev = dept;

	var mode = "";
	var checkJoDiv = false;

	checkJoDiv = $(obj).parent().next('div').hasClass('type');

	if (!checkJoDiv) {

		procObj = makeJoTree; // 콜백 함수

		var url = "ordinJoListRInc.do?admRulSeq=";
		var lsCls = 1;

		doRequestUsingPOST(url + lsiseq + "&mode=" + lsCls + "&chapNo="
				+ nodeId + "&nwYn=" + joTreeValue.nwYn + "&gubun="
				+ joTreeValue.gubun + "&chrClsCd=" + LangType);

	} else {
		eventObj.list.callDepthPop4(obj);
	}
}