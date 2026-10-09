const fileDetailObj = {

    mberId: '',
    evlId: '',


    /**
     * 공통 AJAX 호출
     */
    fn_cmmnAjax: function(data, fn_successCallback) {
        $.ajax({
            url		: data.url,
            method	: "post",
            data	: data,

            success	: fn_successCallback,
            error	: function(data) {
                alert("에러가 발생했습니다.");
            }
        })
    },

    /**
     * 활용신청 체크
     */
    fn_applyReq: function(publicDataPk, publicDataDetailPk, mberId) {
        if (fn_empty(mberId)) {
            if (confirm("로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?")) {
                location.href = '/uim/login/loginView.do';
                return;
            } else {
                return;
            }
        }

        fileDetailObj.fn_cmmnAjax({
            publicDataPk: publicDataPk,
            publicDataDetailPk: publicDataDetailPk,
            url: '/tcs/dss/fileDataApplyReqChck.do'
        }, fileDetailObj.fn_applyReqCb)

    },

    fn_applyReqCb: function(data) {
        let jsonObj = JSON.parse(data);

        if (jsonObj.status === true) {
            window.open("/tcs/dss/selectFileDataApplyReqForm.do" + "?publicDataPk=" + jsonObj.publicDataPk + "&publicDataDetailPk=" + jsonObj.publicDataDetailPk)
        } else {
            alert(jsonObj.errorDc);
        }
    },

    /**
     * 파일데이터 상세 조회
     */
    fn_fileDataDetail	: function(publicDataDetailPk) {
        $("#layer_data_infomation").children().remove();

        fileDetailObj.fn_cmmnAjax({
            publicDataDetailPk: publicDataDetailPk,
            url: '/tcs/dss/selectDpkDetailInfo.do'
        }, fileDetailObj.fn_fileDataDetailCb)
    },

    fn_fileDataDetailCb: function(data) {
        $("#layer_data_infomation").append(data)
    },

    /**
     * 파일 다운로드
     */
    fn_fileDataDown: function(publicDataPk, publicDataDetailPk, atchFileId, fileDetailSn, publicDataHistSn) {
        if(publicDataHistSn > 1) {
            fileDetailObj.fn_checkUpdtDt();
        } else {
            fileDetailObj.fn_checkRegistFile();
        }

        fileDetailObj.fn_cmmnAjax({
            publicDataDetailPk: publicDataDetailPk,
            publicDataPk: publicDataPk,
            atchFileId: atchFileId,
            fileDetailSn: fileDetailSn,
            publicDataTyCode: 'PR0051',
            url: '/tcs/dss/selectFileDataDownload.do'
        }, fileDetailObj.fn_fileDataDownCb);

        $(".recommend-after-download").slideDown();
    },

    fn_fileDataDownCb: function(data) {
        let jsonObj = JSON.parse(data);

        if (jsonObj.status === true) {
            var dataType = jsonObj.dataSetFileDetailInfo.publicDataTyDetailCode;
            if (dataType == 'DATY05') {
		        fn_fileDataDownload(jsonObj.atchFileId, jsonObj.fileDetailSn, jsonObj.dataSetFileDetailInfo.publicDataSj);
            } else {
		        fn_fileDataDownload(jsonObj.atchFileId, jsonObj.fileDetailSn, jsonObj.dataSetFileDetailInfo.dataNm);
            }
        } else {
            if (jsonObj.error) {
                alert(jsonObj.error);
            } else {
                alert("파일 다운로드에 실패했습니다.");
            }
        }
    },

    /**
     * 샘플 파일
     */
    fn_sampleFileDown: function(publicDataPk) {

        fileDetailObj.fn_cmmnAjax({
            publicDataPk: publicDataPk,
            url: '/tcs/dss/selectSampleFileDownload.do'
        }, fileDetailObj.fn_fileDataDownCb)

        $(".recommend-after-download").slideDown();
    },

    fn_parseDateTime: function (value) {
        if (!value) {
            return null;
        }

        let matched = String(value).trim()
            .match(/^(\d{4})[-\/.]?(\d{2})[-\/.]?(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);

        if (matched === null) {
            return null;
        }

        let parsed = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]),
            Number(matched[4] || 0), Number(matched[5] || 0), Number(matched[6] || 0));

        return isNaN(parsed.getTime()) ? null : parsed;
    },

    /**
     * 수정일 체크 (90일 이내 변경 알림)
     */
    fn_checkUpdtDt: function () {
        let updt = fileDetailObj.fn_parseDateTime($('#updtDt').val());

        if (updt === null) {
            return;
        }

        let now = new Date();
        let different = (now.getTime() - updt.getTime()) / (24 * 60 * 60 * 1000);

        if(90 >= different) {
            alert(updt.getFullYear() + '년 ' + (updt.getMonth() + 1) + '월 ' + updt.getDate() + '일에 변경된 데이터입니다.');
        }
    },

    /**
     * 등록 파일 체크
     */
    fn_checkRegistFile: function () {
        $.ajax({
            url: '/tcs/dss/checkFileType.do',
            data: {publicDataPk: $('#publicDataPk').val()},
            async: false ,
            success	: function(data) {
                let parse = JSON.parse(data);
                if(parse.result) {
                    if(parse.count > 1) {
                        fileDetailObj.fn_checkUpdtDt();
                    }
                }
            }
        });
    },

    // 데이터 미리보기
    fn_histAndCsvData	: function(pk, detailPk) {
        $("#section_04").children().remove();

        var dataObj = {
            "publicDataPk": pk,
            "publicDataDetailPk": detailPk,
            "url": '/tcs/dss/selectHistAndCsvData.do'
        };

        fileDetailObj.fn_cmmnAjax(dataObj, fileDetailObj.fn_histAndCsvDataCb);
    },

    fn_histAndCsvDataCb	: function(data) {
        $("#fileHistAndCsvData").html(data);
    },

    fn_personalRecommendData : function(publicDataPk) {

        fileDetailObj.fn_cmmnAjax({
            dataId: publicDataPk,
            url: '/tcs/dss/personalRecommendData.json'
        }, fileDetailObj.fn_personalRecommendDataCb)
    },

    fn_personalRecommendDataCb : function(data) {
        $('#personalRecommendData').html(data);
    },

    fn_recommendData : function(publicDataPk) {

        fileDetailObj.fn_cmmnAjax({
            dataId: publicDataPk,
            url: '/tcs/dss/callRecommendData.json'
        }, fileDetailObj.fn_recommendDataCb)
    },

    fn_recommendDataCb: function (data) {
        $('#recommendData').html(data)
    },

    fn_attentionUpdate : function() {

        if (!fileDetailObj.fn_loginChk()) {
            return;
        }

        const param = [];
        const dataObj = {
            publicDataDetailPk	: $("#publicDataDetailPk").val(),
            publicDataPk		: $("#publicDataPk").val(),
            deleteAt            : 'Y'
        }
        param.push(dataObj);

        $.ajax({
            type: 'POST',
            url: '/iim/dps/idm/updateInterestData.json',
            contentType: 'application/json; charset=utf-8',
            data: JSON.stringify(param),
            dataType : "json",
            success: function(result){
                if(result.status){
                    alert("관심데이터에서 취소 되었습니다.");
                    location.reload();
                }else{
                    alert('처리에 실패하였습니다.');
                }
            },
            error: function(xhr, status, error) {
                alert('처리에 실패하였습니다.');
            }
        });
    },

    fn_attentionCallback	: function(data) {
        var jsonObj = JSON.parse(data);

        if (jsonObj.status === true) {
            alert("관심데이터로 등록되었습니다.");
            location.reload();
        } else {
            if (jsonObj.errorDc) {
                alert(jsonObj.errorDc);
            } else {
                alert("관심데이터 저장에 실패했습니다.");
            }
        }
    },

    fn_attention: function(type) {

        if (!fileDetailObj.fn_loginChk()) {
            return;
        }

        var dataObj = {
            "publicDataDetailPk": $("#publicDataDetailPk").val()
            , "publicDataPk": $("#publicDataPk").val()
            , "publicDataTy": type
            , "saveTy": "insert"};

        dataObj.url = '/tcs/dss/saveAttention.do'

        fileDetailObj.fn_cmmnAjax(dataObj, fileDetailObj.fn_attentionCallback);
    },

    fn_loginChk: function() {

        if (fileDetailObj.mberId === "" || fileDetailObj.mberId === null || fileDetailObj.mberId === undefined) {

            if (confirm("로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?")) {
                location.href = '/uim/login/loginView.do'
                return;
            } else {
                return;
            }
        } else {
            return true;
        }
    },

    fn_saveLike: function (btn, publicDataPk, mbrId) {
        if(fn_empty(mbrId)) {
            if(confirm("로그인이 필요한 서비스입니다. 로그인 화면으로 이동하시겠습니까?")){
                location.href = "/uim/login/loginView.do";
                return;
            };
            return;
        }

        const $likeBtn = $(btn);
        console.log("publicDataPk = " + publicDataPk);
        console.log($likeBtn);

        const requestUrl = "/tcs/dss/saveLike.do";
        $.ajax({
            url: requestUrl
            , type: "POST"
            , dataType: 'json'
            , data: {
                likeYn: $likeBtn.hasClass("active") ? "N" : "Y"
                , publicDataPk: publicDataPk
                , url: requestUrl
            }
        }).done(function(responseData, textStatus, xhr) {
            console.log("[Ajax] success", responseData, textStatus, xhr);
            $likeBtn.removeClass("active");
            if(responseData.likeYn === "Y") {
                $likeBtn.addClass("active");
            } else {
                $likeBtn.removeClass("active");
            }
            $likeBtn.text(responseData.likeCnt)
        }).fail(function(xhr, textStatus, errorThrown) {
            console.log("[Ajax] fail", xhr, textStatus, errorThrown);
        }).always(function(xhr, status) {
            console.log("[Ajax] always", xhr, status);
        });
    },

    fn_saveHate: function (btn, publicDataPk, mbrId) {
        if(fn_empty(mbrId)) {
            if(confirm("로그인이 필요한 서비스입니다. 로그인 화면으로 이동하시겠습니까?")){
                location.href = "/uim/login/loginView.do";
                return;
            };
            return;
        }

        const $hateBtn = $(btn);

        const requestUrl = "/tcs/dss/saveHate.do";
        $.ajax({
            url: requestUrl
            , type: 'POST'
            , dataType: 'json'
            , data: {
                hateYn: $hateBtn.hasClass("active") ? "N" : "Y"
                , publicDataPk: publicDataPk
                , url: requestUrl
            }
        }).done(function(responseData, textStatus, xhr) {
            console.log("[Ajax] success", responseData, textStatus, xhr);
            $hateBtn.removeClass("active");
            if(responseData.hateYn === "Y") {
                $hateBtn.addClass('active');
            } else {
                $hateBtn.removeClass('active');
            }
            $hateBtn.text(responseData.hateCnt);
        }).fail(function(xhr, textStatus, errorThrown) {
            console.log("[Ajax] fail", xhr, textStatus, errorThrown);
        }).always(function(xhr, status) {
            console.log("[Ajax] always", xhr, status);
        });
    }


}

function fn_fileDataDetail(url,publicDataDetailPk) {
    $.ajax({
        url: url,
        data: {publicDataDetailPk: publicDataDetailPk},
        success: function(data) {
            $('#layer_data_information').append(data);
        }
    })
}

function fn_fileDataDown(url,publicDataPk, publicDataDetailPk) {

    $.ajax({
        url: url,
        data: {publicDataPk: publicDataPk,
                publicDataDetailPk: publicDataDetailPk},
        success	: function(data) {
            let jsonObj = JSON.parse(data);
            if (jsonObj.status === true) {
				
				fn_fileDataDownload(jsonObj.atchFileId, jsonObj.fileDetailSn, jsonObj.dataSetFileDetailInfo.dataNm);
		        
            } else {
                alert("파일 다운로드에 실패했습니다.");
            }
        }
    })
}

$(document).on("click", ".dataHistoryList", function() {
    $('.data-history').slideToggle();
    $(this).toggleClass( 'open' );

    let $btn = $(".dataHistoryList");
    $btn.text($btn.text() === '더보기 닫기' ? "더보기 " : "더보기 닫기");

    if($btn.text() === "더보기 ") {
        $btn.append('<i class="iconset ico-arr-more-gray"></i>');
    }
})

function fn_fileDataGoLink(publicDataPk) {

    $.ajax({
        url		: "/tcs/dss/selectLinkUrl.do",
        data	: {"publicDataPk"	: publicDataPk},
        success	: function(data) {
            var jsonObj	= JSON.parse(data);

            if (jsonObj.status === true) {
                var openNewWindow = window.open("about:blank");

                openNewWindow.location.href = jsonObj.linkUrl;
            } else {
                alert(jsonObj.errorDc);
            }
        }
    })
}

// (링크 오픈API) 제공처 URL 조회 후 새창 이동 + 활용신청 INSERT
function fn_apiDataGoLink(publicDataPk) {

    $.ajax({
        url		: "/tcs/dss/selectApiLinkUrl.do",
        data	: {"publicDataPk"	: publicDataPk},
        success	: function(data) {
            var jsonObj	= JSON.parse(data);

            if (jsonObj.status === true) {
                var openNewWindow = window.open("about:blank");

                // 링크 API 활용신청 INSERT
                $.ajax({
                    url		: "/tcs/dss/addApiLinkPrcuse.do",
                    type	: "POST",
                    data	: {"param"	: jsonObj.publicDataDetailPk}
                });
                openNewWindow.location.href = jsonObj.linkUrl;
            } else {
                alert(jsonObj.errorDc);
            }
        }
    })
}



