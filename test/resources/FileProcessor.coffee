models = require('../../models')
config = require('../../config')
Q = require('q')
defs = require('../../routes/ui/definitions')
fs = require('fs-extra')
path = require('path')
utils = require('../../routes/utils')
_ = require('lodash')
url = require('url')
tmp = require('tmp')
logger = require('../../logger')

class FileProcessor

    fileTypes:
        pdf: '.pdf'
        png: '.png'
        jpg: '.jpg'
        jpeg: '.jpeg'

    statuses:
        unknown: 'Unknown'
        invalidFileType: 'invalidFileType'
        notFound: 'notFound'
        documentNotFound: 'documentNotFound'
        alreadySigned: 'alreadySigned'
        notComplete: 'notComplete'
        invalidQrCode: 'invalidQrCode' #missing, multiple, or invalid
        success: 'success'
        error: 'error'

    messages:
        badFile: 'badFile'

    processAttachment: (file, uuid=null, pageNumber=null, documentVersionId = null) ->
        @uuid = uuid
        @pageNumber = pageNumber
        @providedDocumentVersionId = documentVersionId
        #check for supported file
        #all of these deferred should be resolved unless an error occurs. Don't reject if the file is invalid.
        deferred = Q.defer()

        baseName = path.basename(file)
        extName = path.extname(file).toLowerCase()
        fileObj = {file: file, baseName: baseName, extName: extName, status: @statuses.unknown, result: []}

        if extName in [@fileTypes.png, @fileTypes.jpg, @fileTypes.jpeg]
            @handleImageAttachment(deferred, fileObj)
        else if extName in [@fileTypes.pdf]
            @handlePdfAttachment(deferred, fileObj)
        #TODO support zip files
        else
            fileObj.status = @statuses.invalidFileType
            deferred.reject(fileObj)

        deferred.promise

    handleImageAttachment: (deferred, fileObj) ->
        @processSinglePage(fileObj.file)
        .then (result) =>
            if result.checkAndMerge
                return @checkAndMergeFiles(result)
            else
                return result
        .then (result) =>
            fileObj.result = [result]
            fileObj.status = @statuses.success
            deferred.resolve(fileObj)
        .catch (result) =>
            #TODO check to see if this is really an error

            fileObj.result = [result]
            fileObj.status = result.status
            deferred.reject(new Error(result.status))
        .done()


    handlePdfAttachment: (deferred, fileObj) ->
        @processPdfFile(fileObj.file)
        .then (result) =>
            #at this point, check to see if we have received all of the attachment pages, and if so, then merge them
            documentsToMerge = []
            deferredPromises = []
            for obj in result
                #should we check to merge
                if obj.checkAndMerge
                    #only do it once per documentVersionId
                    #documentsToMerge.push(obj.documentVersionId) if _.indexOf(documentsToMerge, obj.documentVersionId) == -1
                    documentsToMerge.push(obj) unless _.find(documentsToMerge, {documentVersionId: obj.documentVersionId}) == -1

                else #otherwise just pass along the result
                    deferredPromises.push(obj)

            #TODO - run these sequentially instead of in parallel. Use reduce.
            for documentToMerge in documentsToMerge
                deferredPromises.push(@checkAndMergeFiles(documentToMerge))
            Q.allSettled(deferredPromises)
        .then (results) =>
            returnValue = []
            for result in results
                if result.state == 'fulfilled'
                    returnValue.push(result.value)
                else if result.state == 'rejected'
                    returnValue.push(result.reason)
                else
                    returnValue.push("ERROR: invalid state on promised result")
            fileObj.result = returnValue
            fileObj.status = @statuses.success
            deferred.resolve(fileObj)
        .catch (result) =>
            fileObj.result = result
            fileObj.status = @statuses.error
            deferred.reject(fileObj)
        .done()

    readBarCode: (command, file) ->
        deferred = Q.defer()
        logger.info("\nzbar reading bar code: #{command}")
        lo = require('child_process')
        lo.exec command , (err, stdout, stderr) =>
            if err
                message = if _.isObject(err) then err.message else err
                result = {status: @statuses.notFound, message: message, filename: path.basename(file)}
                return deferred.reject(result)

            #NOTE: stdout has the qr code values, stderr doesn't indicate an error, only information regarding what happened.
            lines = stdout.split('\r\n')
            lines = _.reject(lines, (line) -> _.isEmpty(line))
            return deferred.reject({status: @statuses.notFound, message: 'No QRCodes found'}) if lines.length == 0

            #this is really weird, but somehow a qr-code had an 'interleaved 2 of 5 code" embedded in it so the logic is changed a bit
#            return deferred.reject({status: @statuses.invalidQrCode, message: 'Multiple QRCodes found'}) if lines.length > 1 #NOTE THIS DIDN'T ALWAYS WORK
            documentAddress = null
            for line in lines
                console.log("zbar code found: #{line}")
                continue if line.indexOf('QR-Code:') != 0
                return deferred.reject({status: @statuses.invalidQrCode, message: 'Multiple QRCodes found'}) if documentAddress
                documentAddress = line.replace('QR-Code:', '')

            return deferred.reject({status: @statuses.notFound, message: 'No QRCodes found, but may have found other'}) unless documentAddress
            parsedAddress = utils.getDocIdFromDocumentAddress(documentAddress)
            return deferred.reject({status: @statuses.invalidQrCode, message: "Invalid address in QRCode: #{documentAddress}"}) unless parsedAddress
            return deferred.resolve(parsedAddress)
        deferred.promise

    processPdfFile: (file) ->
        mainDeferred = Q.defer()

        #start by splitting the pdf file into separate pages.

        #options for making a temp directory where the pages will be placed
        options =
            unsafeCleanup: config.temporaryFileStore.unsafeCleanup
            keep: config.temporaryFileStore.keep

        #defaults back to environment if not set
        options.tmpdir = config.temporaryFileStore.root if config.temporaryFileStore.root
        options.mode = '0775'

        #create a temporary directory for the results
        tmp.dir options, (err, tmpPath) =>
            return mainDeferred.reject({status: @statuses.error, message: err}) if err
            outputFormat = path.join(tmpPath, "pdfsplit-%03d.pdf")

            #there is graphicsMagick npm module. aheckmann.github.io/gm/, but it doesn't have support for +adjoin
            command = "\"#{config.graphicsMagick.path}\" convert -density 200x200 \"#{file}\" +adjoin \"#{outputFormat}\""
            logger.info("\ngraphicsmagick splitting pdf file: #{command}")
            #run the 'split' command
            lo = require('child_process')
            lo.exec command , (err, stdout, stderr) =>
                return mainDeferred.reject({status: @statuses.error, message: err}) if err
                console.log(stdout) if stdout
                fs.readdir tmpPath, (err, files) =>
                    mainDeferred.reject({status: @statuses.error, message: err}) if err

                    singlePromise = files.reduce (p, newFile) =>
                        p.then (results) =>
                            return @processSinglePage(path.join(tmpPath, newFile))
                            .then (result) =>
                                results.push(result)
                            .catch (result) =>
                                results.push(result)
                            .then () =>
                                return results
                    , Q([])

                    singlePromise
                    .then (results) ->
                        return mainDeferred.resolve(results)
                    .done()

        mainDeferred.promise

    processSinglePage: (file) ->

        #TODO either enforce with db transaction or make sure everyone cleans themselves up nicely

        deferred = Q.defer()
        logger.info("\nfile:")
        logger.info(file)
        # First try scanning the PDF, unaltered
        command = "\"#{config.zbar.path}\" \"#{file}\""
        @readBarCode(command, file)
        .then (result) =>
            return deferred.resolve(result)
        .catch (result) =>
            #There can be problems reading the barcode, so create a temp file with sharpened (black or white) image and read that one
            defaultOptions =
                unsafeCleanup: config.temporaryFileStore.unsafeCleanup
                keep: config.temporaryFileStore.keep

            #defaults back to environment if not set
            defaultOptions.tmpdir = config.temporaryFileStore.root if config.temporaryFileStore.root
            tempFile = tmp.fileSync(defaultOptions)

            command = "\"#{config.graphicsMagick.path}\" convert -threshold 50% \"#{file}\" \"#{tempFile.name}\""
            logger.info("\ngraphicsMagick creating the threshold file: #{command}")

            lo = require('child_process')
            lo.exec command , (err, stdout, stderr) =>
                if err
                    message = if _.isObject(err) then err.message else err
                    result = {status: @statuses.notFound, message: message, filename: path.basename(file)}
                    return deferred.reject(result)

                #now scan the altered PDF
                command = "\"#{config.zbar.path}\" \"#{tempFile.name}\""
                @readBarCode(command, tempFile.name)
                .then (result) =>
                    return deferred.resolve(result)
                .catch (result) =>
                    #if they have passed in a the UUID then do a check and accept it instead of the qrcode
                    if result.status == @statuses.notFound and @uuid
                        return deferred.resolve({pageNumber: @pageNumber, uuid: @uuid})
                    else
                        #TODO maybe use manually entered Document ID and Page number
                        return deferred.reject(result)

        deferred.promise
        .then (result) =>
            uuid = result.uuid
            pageNumber = result.pageNumber
            @checkAndAddPage(uuid, pageNumber, file)

    saveSignaturePage: (documentVersion, pageNumber, file, userId, callback) =>
        filename = 'SignaturePage' + path.extname(file)
        type = 'document' #TODO magic string
        utils.saveFileToDbFile file, filename, type, userId, (err, file) ->
            return callback(err) if err

            attributes =
                documentVersionId: documentVersion.id
                name: filename
                type: defs.documentFileTypes.signed
                fileId: file.id
                uuid: documentVersion.uuid
                pageNumber: pageNumber
                systemFileId: null
                createdBy: userId
                updatedBy: userId
            models.documentFile.create(attributes)
            .then (documentFile) ->
                return callback(null, file)
            .catch (err) ->
                return callback(err)

    checkAndAddPage: (uuid, pageNumber, file) =>
        deferred = Q.defer()
        unless uuid
            deferred.reject({status: @statuses.error, message: "checkAndAddPage: Missing DocId"})
        else unless file
            deferred.reject({status: @statuses.error, message: "checkAndAddPage: Missing file"})
        else
            returnValue = {status: 'unknown', message: 'unknown', filename: path.basename(file)}
            where = {uuid: uuid}
            attributes = ['id', 'status', 'uuid', 'executed', 'updatedBy', 'documentId']
            include = [
                model: models.document
            ,
                model: models.documentFile
                include: [
                    model: models.file
                ]
            ]
            models.documentVersion.findOne({where: where, attributes: attributes, include: include})
            .then (documentVersion) =>
                # TODO: if user passed in a document ID manually check to make sure it belongs to the estate plan

                unless documentVersion
                    returnValue.status = @statuses.documentNotFound
                    returnValue.message = "#{uuid}"
                    return deferred.reject(returnValue)

                if @providedDocumentVersionId and @providedDocumentVersionId != documentVersion.id
                    returnValue.status = @statuses.documentNotFound # the given UUID doesn't match the expected documentVersionId
                    returnValue.message = "#{uuid}"
                    return deferred.reject(returnValue)

                documentFile = _.find(documentVersion.documentFiles, {type: defs.documentFileTypes.main})
                return deferred.reject({status: @statuses.error, message: "Missing 'main' file document file for uuid: #{uuid}"}) unless documentFile
                return deferred.reject({status: @statuses.error, message: "Missing file record for documentFile.id: #{documentFile.id}"}) unless documentFile.file

                return deferred.reject({status: @statuses.error, message: "DB Document not found for documentVersion: #{documentVersion.id}"}) unless documentVersion.document

                #at this point we know which document and estateplan this page belongs to so, add it to the returnValue
                returnValue.estatePlanId = documentVersion.document.estatePlanId
                returnValue.ownerId = documentVersion.document.ownerId
                returnValue.documentVersionId = documentVersion.id

                if documentVersion.status == defs.documentVersionStatuses.signedUploaded
                    returnValue.status = @statuses.alreadySigned
                    returnValue.message = "A signature page was already attached to the #{documentVersion.document.name} document."
                    return deferred.reject(returnValue)

                #indicate that we can attempt to merge the files after this point
                returnValue.checkAndMerge = true

                #note: below pageNumber is stored in the database as a string, so compare it that way.
                currentSignaturePage = _.find(documentVersion.documentFiles, {type: defs.documentFileTypes.signed, uuid: uuid, pageNumber: pageNumber.toString()})
                if currentSignaturePage
                    returnValue.status = @statuses.alreadySigned
                    returnValue.message = "A signature page has already been attached to the #{documentVersion.document.name} document."
                    return deferred.reject(returnValue)

                @saveSignaturePage documentVersion, pageNumber, file, documentVersion.updatedBy, (err, sigDocumentFile) =>
                    return deferred.reject({status: @statuses.error, message: err}) if err
                    return deferred.resolve(returnValue)
            .catch (err) ->
                return deferred.reject({status: @statuses.error, message: err})
        deferred.promise

    checkAndMergeFiles: (documentData) ->
        documentVersionId = documentData.documentVersionId
        stagedDirs = []
        deferred = Q.defer()
        attributes = ['id', 'status', 'uuid', 'executed', 'updatedBy', 'documentId', 'numSignaturePages']
        include = [
            model: models.document
        ,
            model: models.documentFile
            include: [
                model: models.file
            ]
        ,
            model: models.packageVersion
        ]
        where = {id: documentVersionId}

        Q(models.documentVersion.findOne({where: where, include: include, attributes: attributes}))
        .then (documentVersion) =>
            throw {status: @statuses.error, message: "documentVersion not found for #{documentVersionId}"} unless documentVersion #TODO set the right error

            expectedCount = documentVersion.numSignaturePages

            #filter out the duplicates (note should not happen, but there was a bug in the past where there could be duplicates.
            signatureFiles = []
            for signatureFile in _.filter(documentVersion.documentFiles, {type: defs.documentFileTypes.signed})
                found = _.find(signatureFiles, {uuid: signatureFile.uuid, pageNumber: signatureFile.pageNumber})
                signatureFiles.push(signatureFile) unless found

            signatureFiles = _.sortBy(signatureFiles, 'pageNumber')

            logger.info("\nexpectedCount " + expectedCount);
            logger.info("signatureFiles.length " + signatureFiles.length);
            throw {status: @statuses.alreadySigned, documentVersionId: documentVersionId} if documentVersion.status == defs.documentVersionStatuses.signedUploaded  #TODO test this
            throw {status: @statuses.notComplete, documentVersionId: documentVersionId} unless expectedCount == signatureFiles.length #TODO test this
            mainDocumentFile = _.find(documentVersion.documentFiles, {type: defs.documentFileTypes.main})

            #stage all of the files
            documentFilesToStage = [].concat([mainDocumentFile], signatureFiles)
            result =
                documentVersion: documentVersion
                mainDocumentFile: mainDocumentFile
                files: []
                dirs: []

            #some goofy logic here, have to stage the files in order
            somePromise = documentFilesToStage.reduce (p, documentFile) ->
                return p.then () ->
                    stageDeferred = Q.defer()
                    utils.stageFileFromLocation documentFile.file.location, (err, stagedDir, stagedPath) ->
                        return stageDeferred.reject(err) if err
                        result.dirs.push(stagedDir)
                        result.files.push(stagedPath)
                        return stageDeferred.resolve(result)
                    stageDeferred.promise
            , Q() # pass in a promise that will resolve - Q() does this

            somePromise
        .then (result) =>
            innerDeferred = Q.defer()
            documentVersion = result.documentVersion
            mainDocumentFile = result.mainDocumentFile
            stagedDirs = result.dirs
            files = result.files

            tmp.tmpName {tmpdir: stagedDirs[0], postfix: path.extname(files[0])}, (err, mergeOutputPath) =>
                result.mergeOutputPath = mergeOutputPath
                @convertAndMergeFiles(files, mergeOutputPath)
                .then () ->
                    innerDeferred.resolve(result)
                .catch (result) ->
                    innerDeferred.reject(result)
            innerDeferred.promise
        .then (result) =>
            mainDocumentFile = result.mainDocumentFile
            documentVersion = result.documentVersion
            mergeOutputPath = result.mergeOutputPath

            innerDeferred = Q.defer()
            # replace the original file with the newly generated file
            dbFile = mainDocumentFile.file
            stats = fs.statSync(mergeOutputPath)
            logger.info("Uploading finished file to server. Source: #{mergeOutputPath}. Destination: #{dbFile.location} size: #{stats.size}")
            utils.saveFileToLocation dbFile.location, mergeOutputPath, (err, realLocation) =>
                return innerDeferred.reject({status: @statuses.error, message: err}) if err

                logger.info("Finished Uploading file to #{realLocation}")
                #since we are just replacing, set the updated columns
                dbFile.updatedBy = documentVersion.updatedBy
                dbFile.location = realLocation
                dbFile.save()
                .then () =>
                    #update the status of the document version
                    documentVersion.status = defs.documentVersionStatuses.signedUploaded
                    documentVersion.statusChangedAt = new Date()
                    documentVersion.save()
                .then () =>
                    #set the return object with the correct status
                    result.message = documentVersion.document.name
                    result.status = @statuses.success
                    result.documentChanged = true
                    return innerDeferred.resolve(result)
                .catch (err) =>
                    return innerDeferred.reject({status: @statuses.error, message: err})
            innerDeferred.promise
        .then (result) =>
            packageVersionIds = _.map(result.documentVersion.packageVersions, 'id')
            finalResult =
                message: result.message
                status: result.status
                documentChanged: result.documentChanged
                documentVersionId: result.documentVersion.id
                packageVersionIds: packageVersionIds
                estatePlanId: documentData.estatePlanId
                ownerId: documentData.ownerId

            return deferred.resolve(finalResult)
        .catch (result) =>
            if not result.status or result.status == @statuses.error
                return deferred.reject(result)
            else
                return deferred.resolve(result)
        .fin (result) ->
            #delete the staged directory and its files
            for stagedDir in stagedDirs
                fs.remove stagedDir, (err) -> #this can run asynchronously we don't care about the results
                    logger.info("\nFailed to remove temporary directory: #{stagedDir}") if err
        .done()
        deferred.promise

    convertSimpleFileToPdf: (file, cleanedFiles, index) ->
        deferred = Q.defer()

        outputFile = file + '.pdf'
        command = "\"#{config.graphicsMagick.path}\" convert -auto-orient -units pixelsperinch -density 72 -page Letter  \"#{file}\" \"#{outputFile}\""
        logger.info("\ngraphicsmagick converting image to pdf file: #{command}")

        #run the 'split' command
        lo = require('child_process')
        lo.exec command , (err, stdout, stderr) =>
            return deferred.reject({status: @statuses.error, message: err}) if err
            console.log(stdout) if stdout
            cleanedFiles[index] = outputFile
            return deferred.resolve()

        return deferred.promise

    convertAndMergeFiles: (files, outputFile) ->
        cleanedFiles = _.clone(files)
        Q.fcall () =>
            promises = []
            for file, index in files
                extName = path.extname(file).toLowerCase()
                unless extName == '.pdf'
                    #convert the file to pdf
                    promises.push @convertSimpleFileToPdf file, cleanedFiles, index
            Q.all(promises)
        .then () =>
            @mergeFiles(cleanedFiles, outputFile)

    mergeFiles: (files, outputFile) ->
        deferred = Q.defer()
        return deferred.reject({status: @statuses.error, message: "need at least 2 files to merge"}) unless files?.length > 1

        fileString = _.reduce files
            , (memo, file) ->
                memo + " \"#{file}\""
            , ''

        command = "\"#{config.ghostscript.path}\" -dBATCH -dNOPAUSE -q -sPAPERSIZE=letter -dPDFFitPage -dFIXEDMEDIA -sDEVICE=pdfwrite -sOutputFile=\"#{outputFile}\" #{fileString}"
        logger.info("\nghostscript merging files: #{command}")
        lo = require('child_process')
        lo.exec command , (err, stdout, stderr) =>
            return deferred.reject({status: @statuses.error, message: err}) if err
            console.log(stdout) if stdout
            deferred.resolve()

        deferred.promise


module.exports = FileProcessor

testMe = (filename) ->
    fileProcessor = new FileProcessor()
    fileProcessor.processAttachment(filename)
    .then (result) ->
            debugger
            result
    .catch (result) ->
            debugger
            throw result
    .done()

#testMe('C:\\src\\legacynotes\\pdftestdocs\\pdftestdocs\\2Pages.pdf2')