"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteOneDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteOneDocumentArgs_1 = require("./args/DeleteOneDocumentArgs");
const Document_1 = require("../../../models/Document");
const helpers_1 = require("../../../helpers");
let DeleteOneDocumentResolver = class DeleteOneDocumentResolver {
    async deleteOneDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteOneDocumentResolver = DeleteOneDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneDocumentArgs_1.DeleteOneDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DeleteOneDocumentResolver.prototype, "deleteOneDocument", null);
exports.DeleteOneDocumentResolver = DeleteOneDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], DeleteOneDocumentResolver);
